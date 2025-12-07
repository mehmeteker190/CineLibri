const jwt = require('jsonwebtoken');

exports.protect = async (req, res, next) => {
    let token;

  
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
        
            token = req.headers.authorization.split(' ')[1];

       
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

        
            req.user = decoded;

        } catch (error) {
            console.error('Token Hatası:', error.message);
            return res.status(401).json({ message: 'Yetkisiz erişim, token geçersiz.' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Yetkisiz erişim, token bulunamadı.' });
    }
};