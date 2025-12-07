const axios = require('axios');

const googleBooksClient = axios.create({
    baseURL: 'https://www.googleapis.com/books/v1/volumes',
    params: {
        key: process.env.GOOGLE_BOOKS_API_KEY,
        langRestrict: 'tr',
        printType: 'books'
    }
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(requestFn, retries = 3) {
    try {
        return await requestFn();
    } catch (error) {
        if (retries > 0 && error.response && error.response.status >= 500) {
            console.log(`Google Books Bağlantı Hatası. Tekrar deneniyor... (Kalan hak: ${retries})`);
            await delay(1500);
            return fetchWithRetry(requestFn, retries - 1);
        }
        throw error;
    }
}

exports.searchBooks = async (query, filters = {}) => {
    try {
        const response = await fetchWithRetry(() => googleBooksClient.get('', {
            params: { q: query }
        }));

        if (!response.data.items) return [];

        let results = response.data.items.map(book => {
            const info = book.volumeInfo;
            return {
                id: book.id,
                title: info.title,
                year: info.publishedDate ? info.publishedDate.split('-')[0] : 'Bilinmiyor',
                poster: info.imageLinks ? info.imageLinks.thumbnail : null,
                overview: info.description || 'Açıklama yok.',
                rating: info.averageRating || 0,
                type: 'book'
            };
        });

        if (filters.year) {
            results = results.filter(b => b.year === filters.year.toString());
        }
        if (filters.minRating) {
            results = results.filter(b => b.rating >= parseFloat(filters.minRating));
        }

        return results;

    } catch (error) {
        console.error('Google Books Arama Hatası:', error.message);
        return [];
    }
};

exports.getBookDetails = async (id) => {
    try {
        const response = await fetchWithRetry(() => googleBooksClient.get(`/${id}`));
        const info = response.data.volumeInfo;

        return {
            id: response.data.id,
            title: info.title,
            original_title: info.title,
            overview: info.description ? info.description.replace(/<[^>]*>?/gm, '') : 'Özet bulunmuyor.',
            poster_path: info.imageLinks ? info.imageLinks.thumbnail : null,
            release_date: info.publishedDate || 'Bilinmiyor',
            authors: info.authors || [],
            page_count: info.pageCount,
            categories: info.categories || [],
            vote_average: info.averageRating || 0,
            type: 'book'
        };
    } catch (error) {
        console.error('Google Books Detay Hatası:', error.message);
        return null;
    }
};