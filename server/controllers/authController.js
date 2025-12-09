const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../config/db');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});


exports.register = async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'Lütfen tüm alanları doldurun.' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, hashedPassword]
        );
        res.status(201).json({ message: 'Kullanıcı başarıyla kaydedildi.', user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: 'Bu e-posta veya kullanıcı adı zaten kullanımda.' });
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};


exports.login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'E-posta ve şifre gereklidir.' });

    try {
        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = userResult.rows[0];
        if (!user) return res.status(401).json({ message: 'E-posta veya şifre hatalı.' });

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) return res.status(401).json({ message: 'E-posta veya şifre hatalı.' });

        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(200).json({
            message: 'Giriş başarılı.',
            token,
            user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar_url }
        });
    } catch (err) { res.status(500).json({ message: 'Sunucu hatası.' }); }
};


exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: 'Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.' });
        }

      
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expireDate = new Date(Date.now() + 5 * 60 * 1000); 

        await db.query(
            'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE email = $3',
            [verificationCode, expireDate, email]
        );

        const mailOptions = {
            from: '"CineLibri Destek" <no-reply@cinelibri.com>',
            to: email,
            subject: 'Şifre Sıfırlama Kodu',
            text: `Merhaba,\n\nŞifrenizi sıfırlamak için doğrulama kodunuz: ${verificationCode}\n\nBu kod 5 dakika geçerlidir.`,
            html: `<h3>CineLibri Şifre Sıfırlama</h3><p>Doğrulama Kodunuz: <b style="font-size: 24px; color: #4A90E2;">${verificationCode}</b></p><p>Bu kod 5 dakika süreyle geçerlidir.</p>`
        };

        await transporter.sendMail(mailOptions);
        console.log(`Mail gönderildi: ${email} -> ${verificationCode}`);

        res.status(200).json({ message: 'Doğrulama kodu e-posta adresinize gönderildi!' });

    } catch (err) {
        console.error('Mail Hatası:', err);
        res.status(500).json({ message: 'Mail gönderilemedi. Sunucu hatası.' });
    }
};


exports.verifyCode = async (req, res) => {
    const { email, code } = req.body;
    try {
        const userRes = await db.query(
            'SELECT * FROM users WHERE email = $1 AND reset_password_token = $2 AND reset_password_expires > NOW()',
            [email, code]
        );

        if (userRes.rows.length === 0) {
            return res.status(400).json({ message: 'Kod hatalı veya süresi dolmuş.' });
        }

        res.status(200).json({ message: 'Kod doğrulandı.' });
    } catch (err) {
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
};

exports.resetPassword = async (req, res) => {
    const { email, code, newPassword } = req.body;

    try {
        const userRes = await db.query(
            'SELECT * FROM users WHERE email = $1 AND reset_password_token = $2 AND reset_password_expires > NOW()',
            [email, code]
        );

        if (userRes.rows.length === 0) {
            return res.status(400).json({ message: 'İşlem başarısız (Kod süresi dolmuş olabilir).' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await db.query(
            'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE email = $2',
            [hashedPassword, email]
        );

        res.status(200).json({ message: 'Şifreniz başarıyla güncellendi! Giriş yapabilirsiniz.' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Hata oluştu.' });
    }
};