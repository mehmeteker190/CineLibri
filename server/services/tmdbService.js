const axios = require('axios');

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const API_KEY = process.env.TMDB_API_KEY;


const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function fetchWithRetry(url, params, retries = 3) {
        try {
            const response = await axios.get(url, { params });
            return response;
        } catch (error) {
            if (retries > 0) {
                console.log(`TMDB Bağlantı hatası. Tekrar deneniyor... (Kalan hak: ${retries})`);
                await delay(1500);
                return fetchWithRetry(url, params, retries - 1);
            }
            throw error;
        }
    }

exports.searchMovies = async (query) => {
    try {
        const response = await fetchWithRetry(`${TMDB_BASE_URL}/search/movie`, {
            api_key: API_KEY,
            query: query,
            language: 'tr-TR',
            include_adult: false
        });

        return response.data.results.map(movie => ({
            id: movie.id,
            title: movie.title,
            year: movie.release_date ? movie.release_date.split('-')[0] : null,
            poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
            rating: movie.vote_average,
            type: 'movie'
        }));
    } catch (error) {
        console.error('TMDB Arama Hatası:', error.message);
        return [];
    }
};

exports.getMovieDetails = async (id) => {
    try {
        const response = await fetchWithRetry(`${TMDB_BASE_URL}/movie/${id}`, {
            api_key: API_KEY, language: 'tr-TR'
        });
        const data = response.data;
        return {
            id: data.id,
            title: data.title,
            overview: data.overview,
            poster_path: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
            release_date: data.release_date,
            vote_average: data.vote_average
        };
    } catch (error) {
        console.error('TMDB Detay Hatası:', error.message);
        return null;
    }
};

exports.getMovieDetails = async (id) => {
    try {
        const response = await fetchWithRetry(`${TMDB_BASE_URL}/movie/${id}`, {
            api_key: API_KEY,
            language: 'tr-TR'
        });
        const data = response.data;
        return {
            id: data.id,
            title: data.title,
            overview: data.overview,
            poster_path: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
            release_date: data.release_date,
            vote_average: data.vote_average
        };
    } catch (error) {
        console.error('TMDB Detay Hatası:', error.message);
        return null;
    }
};

exports.discoverMovies = async (filters = {}) => {
    const params = {
        api_key: API_KEY,
        language: 'tr-TR',
        sort_by: 'popularity.desc',
        page: 1,
        include_adult: false
    };

    if (filters.minYear) params['primary_release_date.gte'] = `${filters.minYear}-01-01`;
    if (filters.maxYear) params['primary_release_date.lte'] = `${filters.maxYear}-12-31`;

    if (filters.year) params.primary_release_year = filters.year;

    Puan
    if (filters.minRating) params['vote_average.gte'] = filters.minRating;

    try {
        const response = await axios.get(`${TMDB_BASE_URL}/discover/movie`, { params });

        return response.data.results.map(movie => ({
            id: movie.id,
            title: movie.title,
            year: movie.release_date ? movie.release_date.split('-')[0] : 'Bilinmiyor',
            poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
            rating: movie.vote_average,
            type: 'movie'
        })) || [];

    } catch (error) {
        console.error('TMDb Discover Hatası:', error.message);
        return [];
    }
};