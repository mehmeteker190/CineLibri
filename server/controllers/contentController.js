const tmdbService = require('../services/tmdbService');
const googleBooksService = require('../services/googleBooksService');
const db = require('../config/db');

exports.searchContent = async (req, res) => {
    const query = req.query.q || req.query.query;
    const typeFilter = req.query.type || 'all';

    const minYear = req.query.minYear ? parseInt(req.query.minYear) : null;
    const maxYear = req.query.maxYear ? parseInt(req.query.maxYear) : null;

    const minRating = req.query.minRating ? parseFloat(req.query.minRating) : null;

    try {
        let moviePromise = Promise.resolve([]);
        let bookPromise = Promise.resolve([]);

        if (typeFilter === 'all' || typeFilter === 'movie') {
            if (query) {

                moviePromise = tmdbService.searchMovies(query).then(movies => {
                    return movies.filter(m => {
                        const y = parseInt(m.year);
                        if (isNaN(y)) return false;

                        if (minYear && y < minYear) return false;
                        if (maxYear && y > maxYear) return false;
                        if (minRating && m.rating < minRating) return false;
                        return true;
                    });
                }).catch(() => []);
            } else {

                moviePromise = tmdbService.discoverMovies({
                    minYear,
                    maxYear,
                    minRating
                }).catch(() => []);
            }
        }

        if (typeFilter === 'all' || typeFilter === 'book') {
            const qBook = query ? query : 'subject:general';
            bookPromise = googleBooksService.searchBooks(qBook).then(books => {

                return books.filter(b => {
                    const y = parseInt(b.year);
                    if (isNaN(y)) return false;

                    if (minYear && y < minYear) return false;
                    if (maxYear && y > maxYear) return false;
                    if (minRating && b.rating < minRating) return false;
                    return true;
                });
            }).catch(() => []);
        }

        const [movies, books] = await Promise.all([moviePromise, bookPromise]);

        const secureBooks = books.map(b => ({ ...b, poster: b.poster?.replace(/^http:\/\//i, 'https://') }));

        res.status(200).json({ movies, books: secureBooks, users: [] });

    } catch (error) {
        console.error('Arama Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

exports.getPopular = async (req, res) => {
    try {
        const [movies, books] = await Promise.all([
            tmdbService.getPopularMovies(),
            googleBooksService.searchBooks('subject:fiction')
        ]);

        const moviesWithType = movies.map(m => ({ ...m, type: 'movie' }));
        const booksWithType = books.map(b => ({ ...b, type: 'book' }));

        const limitedMovies = moviesWithType.slice(0, 21);
        const limitedBooks = booksWithType.slice(0, 21);

        res.status(200).json({
            movies: limitedMovies,
            books: limitedBooks
        });

    } catch (error) {
        console.error('Popüler İçerik Hatası:', error);
        res.status(500).json({ message: 'Popüler içerikler çekilemedi.' });
    }
};

exports.searchContent = async (req, res) => {
    const query = req.query.q || req.query.query;
    const typeFilter = req.query.type || 'all';
    const minYear = req.query.minYear ? parseInt(req.query.minYear) : null;
    const maxYear = req.query.maxYear ? parseInt(req.query.maxYear) : null;
    const minRating = req.query.minRating ? parseFloat(req.query.minRating) : null;

    try {
        let moviePromise = Promise.resolve([]);
        let bookPromise = Promise.resolve([]);

        if (typeFilter === 'all' || typeFilter === 'movie') {
            if (query) {
                moviePromise = tmdbService.searchMovies(query);
                moviePromise = moviePromise.then(movies => movies.filter(m => {
                    const y = parseInt(m.year);
                    if (minYear && y < minYear) return false;
                    if (maxYear && y > maxYear) return false;
                    if (minRating && m.rating < minRating) return false;
                    return true;
                }));
            } else {
                moviePromise = tmdbService.discoverMovies({ minYear, maxYear, minRating });
            }
        }

        if (typeFilter === 'all' || typeFilter === 'book') {
            const qBook = query ? query : 'subject:general';
            bookPromise = googleBooksService.searchBooks(qBook, { year: null, minRating });
        }

        const [movies, books] = await Promise.all([moviePromise, bookPromise]);

        const secureBooks = books.map(b => ({ ...b, poster: b.poster?.replace(/^http:\/\//i, 'https://') }));

        res.status(200).json({ movies, books: secureBooks, users: [] });

    } catch (error) {
        console.error('Arama Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

exports.getPopular = async (req, res) => {
    try {
        const [movies, books] = await Promise.all([
            tmdbService.discoverMovies({}),
            googleBooksService.searchBooks('subject:fiction')
        ]);

        res.status(200).json({
            movies: movies.slice(0, 21),
            books: books.slice(0, 21)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Hata.' });
    }
};

exports.getContentDetails = async (req, res) => {
    const { type, id } = req.params;
    const currentUserId = req.user.id;

    try {
        let contentData = null;

        if (type === 'movie') {
            contentData = await tmdbService.getMovieDetails(id);
        } else if (type === 'book') {
            contentData = await googleBooksService.getBookDetails(id);
            if (contentData && contentData.poster_path) {
                contentData.poster_path = contentData.poster_path.replace(/^http:\/\//i, 'https://');
            }
        } else {
            return res.status(400).json({ message: 'Geçersiz tür.' });
        }

        if (!contentData) {
            return res.status(404).json({ message: 'İçerik bulunamadı (API Yanıt Vermedi).' });
        }

        const reviewsQuery = `
            SELECT l.user_id, l.rating, l.review, 
                   to_char(l.watched_at, 'YYYY-MM-DD"T"HH24:MI:SS') as date,
                   u.username, u.avatar_url
            FROM library_items l
            JOIN users u ON l.user_id = u.id
            WHERE l.api_id = $1 AND l.content_type = $2 
              AND ((l.review IS NOT NULL AND l.review != '') OR (l.rating IS NOT NULL AND l.rating > 0))
            ORDER BY l.watched_at DESC
        `;
        const reviews = await db.query(reviewsQuery, [id, type]);

        const ratingsQuery = `SELECT AVG(rating)::numeric(10,1) as avg_rating, COUNT(*) as total_votes FROM library_items WHERE api_id = $1 AND content_type = $2 AND rating IS NOT NULL`;
        const ratings = await db.query(ratingsQuery, [id, type]);

        const myInteraction = await db.query(`SELECT id, rating, review, status FROM library_items WHERE user_id = $1 AND api_id = $2 AND content_type = $3`, [currentUserId, id, type]);
        const myData = myInteraction.rows.length > 0 ? myInteraction.rows[0] : {};

        res.status(200).json({
            ...contentData,
            reviews: reviews.rows,
            platformRating: ratings.rows[0].avg_rating || 0,
            totalVotes: ratings.rows[0].total_votes || 0,
            myRating: myData.rating || 0,
            myReview: myData.review || "",
            myStatus: myData.status || null,
            libraryId: myData.id || null
        });

    } catch (error) {
        console.error('[Detay Hatası]:', error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};