const db = require('../config/db');

const logActivity = async (userId, type, title, poster, contentApiId, contentType, rating = null, review = null) => {
    try {
        const userRes = await db.query('SELECT username, avatar_url FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) return;

        const { username, avatar_url } = userRes.rows[0];

        const checkQuery = `
            SELECT id FROM activities 
            WHERE user_id = $1 
              AND content_api_id = $2 
              AND content_type = $3 
              AND activity_type IN ('rate_content', 'review_content')
        `;
        const existingActivity = await db.query(checkQuery, [userId, contentApiId, contentType]);

        if (existingActivity.rows.length > 0) {
            const updateQuery = `
                UPDATE activities 
                SET rating = $1, 
                    review_text = $2, 
                    created_at = NOW(),
                    activity_type = $3
                WHERE id = $4
            `;
            await db.query(updateQuery, [rating, review, type, existingActivity.rows[0].id]);

        } else {
            await db.query(
                `INSERT INTO activities (user_id, username, avatar_url, activity_type, content_title, content_poster, 
                                        content_api_id, content_type, rating, review_text)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [userId, username, avatar_url, type, title, poster, contentApiId, contentType, rating, review]
            );
        }

    } catch (err) {
        console.error('Aktivite Loglama Hatası:', err);
    }
};


exports.addToLibrary = async (req, res) => {
    const userId = req.user.id;
    const { api_id, content_type, title, poster_url, status } = req.body;

    if (!api_id || !title || !content_type) {
        return res.status(400).json({ message: 'Eksik veri gönderildi.' });
    }

    try {
        const query = `
            INSERT INTO library_items (user_id, api_id, content_type, title, poster_url, status)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const values = [userId, api_id, content_type, title, poster_url, status || 'planned'];
        const result = await db.query(query, values);



            res.status(201).json({
                message: 'Başarıyla listeye eklendi.',
                item: result.rows[0]
            });

    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ message: 'Bu içerik zaten listenizde var.' });
        console.error('Kütüphane Ekleme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

exports.getLibrary = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM library_items WHERE user_id = $1 ORDER BY added_at DESC', [req.user.id]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Kütüphane Getirme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};


exports.updateLibraryItem = async (req, res) => {
    const userId = req.user.id;
    const itemId = req.params.id;
    const { status } = req.body; 

    try {
        const query = `
            UPDATE library_items 
            SET status = $1::text, 
                watched_at = (CASE WHEN $1::text = 'watched' THEN NOW() ELSE watched_at END)
            WHERE id = $2 AND user_id = $3
            RETURNING *
        `;

        const result = await db.query(query, [status, itemId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Kayıt bulunamadı veya yetkiniz yok.' });
        }

        res.status(200).json({
            message: 'Güncelleme başarılı.',
            item: result.rows[0]
        });

    } catch (error) {
        console.error('Güncelleme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};


exports.getUserLibrary = async (req, res) => {
    const targetId = parseInt(req.params.id);
    try {
        const result = await db.query(
            'SELECT * FROM library_items WHERE user_id = $1 ORDER BY added_at DESC',
            [targetId]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Library Fetch Error:", error);
        res.status(500).json({ message: 'Kütüphane çekilemedi.' });
    }
};


exports.addReview = async (req, res) => {
    const userId = req.user.id;
    const { api_id, content_type, review, rating, title, poster_url } = req.body;


    let finalReview = review && review.trim().length > 0 ? review.trim() : null;
    let finalRating = rating ? parseInt(rating) : null;

 
    if (!finalRating && !finalReview) {
       
        return res.status(400).json({
            message: 'Lütfen geçerli bir puan verin veya bir yorum yazın.'
        });
    }

    try {
        let itemRes = await db.query(
            'SELECT * FROM library_items WHERE user_id = $1 AND api_id = $2 AND content_type = $3',
            [userId, api_id, content_type]
        );

        let result;

        if (itemRes.rows.length === 0) {
            INSERT
            const safeTitle = title || 'Bilinmeyen İçerik';
            const safePoster = poster_url || 'https://placehold.co/300x450';

            const insertQuery = `
                INSERT INTO library_items 
                (user_id, api_id, content_type, title, poster_url, status, rating, review, watched_at)
                VALUES ($1, $2, $3, $4, $5, 'watched', $6, $7, NOW())
                RETURNING *
            `;
            result = await db.query(insertQuery, [userId, api_id, content_type, safeTitle, safePoster, finalRating, finalReview]);

        } else {
            UPDATE
            const updateQuery = `
                UPDATE library_items 
                SET review = $1, 
                    rating = $2,  -- Gelen puan neyse onu yaz (null ise null)
                    status = 'watched', 
                    watched_at = NOW()
                WHERE user_id = $3 AND api_id = $4 AND content_type = $5
                RETURNING *
            `;
            result = await db.query(updateQuery, [finalReview, finalRating, userId, api_id, content_type]);
        }

        await logActivity(userId, 'rate_content', result.rows[0].title, result.rows[0].poster_url,
            api_id, content_type, finalRating, finalReview);

        res.status(200).json({ message: 'Kaydedildi!', review: result.rows[0] });

    } catch (error) {
        console.error('Yorum/Puan Ekleme Hatası:', error);
        res.status(500).json({ message: 'İşlem sırasında hata oluştu.' });
    }
};


    exports.createCustomList = async (req, res) => {
        const userId = req.user.id;
        const { name } = req.body;
        if (!name) return res.status(400).json({ message: 'Liste adı gerekli.' });

        try {
            const result = await db.query(
                'INSERT INTO custom_lists (user_id, name) VALUES ($1, $2) RETURNING *',
                [userId, name]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Liste oluşturulamadı.' });
        }
    };

exports.getCustomLists = async (req, res) => {
    const userId = req.query.userId || req.user.id;


    const checkApiId = req.query.checkApiId || null;
    const checkType = req.query.checkType || null;

    try {
        const query = `
            SELECT 
                l.*, 
                (SELECT COUNT(*)::int FROM custom_list_items WHERE list_id = l.id) as item_count,
                CASE 
                    WHEN $2::text IS NOT NULL THEN 
                        EXISTS(SELECT 1 FROM custom_list_items WHERE list_id = l.id AND api_id = $2::text AND content_type = $3::text)
                    ELSE false 
                END as is_added
            FROM custom_lists l
            WHERE l.user_id = $1
            ORDER BY l.created_at DESC
        `;

        const result = await db.query(query, [userId, checkApiId, checkType]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hata.' });
    }
};

exports.addToCustomList = async (req, res) => {
    const { listId, api_id, content_type, title, poster_url } = req.body;
    try {
        await db.query(
            `INSERT INTO custom_list_items (list_id, api_id, content_type, title, poster_url)
             VALUES ($1, $2, $3, $4, $5)`,
            [listId, api_id, content_type, title, poster_url]
        );
        res.status(200).json({ message: 'Eklendi!' });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: 'Zaten listede.' });
        res.status(500).json({ message: 'Hata.' });
    }
};

exports.getCustomListItems = async (req, res) => {
    const listId = req.params.listId;

    try {
        const result = await db.query(
            'SELECT * FROM custom_list_items WHERE list_id = $1 ORDER BY added_at DESC',
            [listId]
        );

        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Liste Detay Hatası:', err);
        res.status(500).json({ message: 'Liste içeriği alınamadı.' });
    }
};
exports.deleteReview = async (req, res) => {
    const userId = req.user.id;
    const libraryId = req.params.id;

    try {
        const checkResult = await db.query(
            'SELECT api_id, content_type FROM library_items WHERE id = $1 AND user_id = $2',
            [libraryId, userId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Kayıt bulunamadı veya yetkiniz yok.' });
        }

        const { api_id, content_type } = checkResult.rows[0];

        const result = await db.query(
            'UPDATE library_items SET rating = NULL, review = NULL WHERE id = $1 RETURNING *',
            [libraryId]
        );

        await db.query(
            `DELETE FROM activity_likes 
             WHERE activity_id IN (
                 SELECT id FROM activities 
                 WHERE user_id = $1 
                 AND content_api_id = $2 
                 AND content_type = $3
                 AND activity_type IN ('rate_content', 'review_content')
             )`,
            [userId, api_id, content_type]
        );

        await db.query(
            `DELETE FROM activities 
             WHERE user_id = $1 
             AND content_api_id = $2 
             AND content_type = $3
             AND activity_type IN ('rate_content', 'review_content')`,
            [userId, api_id, content_type]
        );

            res.status(200).json({ message: 'Yorum, puan ve tüm etkileşimler silindi.', item: result.rows[0] });

    } catch (err) {
        console.error('Yorum Silme Hatası:', err);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

exports.deleteCustomList = async (req, res) => {
    const userId = req.user.id;
    const listId = req.params.id;

    try {
        await db.query('DELETE FROM custom_list_items WHERE list_id = $1', [listId]);

        const result = await db.query('DELETE FROM custom_lists WHERE id = $1 AND user_id = $2', [listId, userId]);

        if (result.rowCount === 0) return res.status(404).json({ message: 'Liste bulunamadı.' });

        res.status(200).json({ message: 'Liste silindi.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hata.' });
    }
};

exports.removeFromLibrary = async (req, res) => {
    const userId = req.user.id;
    const libraryId = req.params.id;

    try {
        const result = await db.query(
            'DELETE FROM library_items WHERE id = $1 AND user_id = $2 RETURNING *',
            [libraryId, userId]
        );

        if (result.rowCount === 0) return res.status(404).json({ message: 'Kayıt bulunamadı.' });

        res.status(200).json({ message: 'Kütüphaneden kaldırıldı.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hata.' });
    }
};

exports.removeCustomListItem = async (req, res) => {
    const { listId, apiId } = req.params;

        try {
        const result = await db.query(
            'DELETE FROM custom_list_items WHERE list_id = $1 AND api_id = $2 RETURNING *',
            [listId, apiId]
        );

        if (result.rowCount === 0) return res.status(404).json({ message: 'Öğe bulunamadı.' });

        res.status(200).json({ message: 'Listeden çıkarıldı.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hata.' });
    }
};