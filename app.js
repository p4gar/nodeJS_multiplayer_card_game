const express = require('express');
const app = express();
const path = require('path');
const { createPool } = require('mysql');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');

// MySQL connection pool
const pool = createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'python-memory-card-game',
    connectionLimit: 10
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set views and template engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Body parser
app.use(bodyParser.urlencoded({ extended: true }));

// Use session
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key', // Use environment variable for security
    resave: false,
    saveUninitialized: true
}));

// Routes
app.get('/login', (req, res) => {
    const success = req.query.success === 'true'; // Check if registration was successful
    const message = req.query.message === 'true';
    res.render('login', { success, message });
});

// Register route
app.get('/register', (req, res) => {
    res.render('register');
});

// Index route
app.get('/index', (req, res) => {
    if (req.session.user) {
        res.render('index', { user: req.session.user });
    } else {
        res.redirect('/login');
    }
});

// Game route
app.get('/game', (req, res) => {
    if (req.session.user) {
        const mode = req.query.mode; // Get the mode from the query parameters
        res.render('game', { user: req.session.user, mode });
    } else {
        res.redirect('/login');
    }
});

// Quiz route
app.get('/quiz', (req, res) => {
    res.render('quiz');
});

// Login logic
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    pool.query('SELECT * FROM accounts WHERE username = ?', [username], (error, results) => {
        if (error) {
            console.error('Database query error:', error);
            return res.status(500).send('Server error');
        }

        if (results.length === 0) {
            return res.redirect('/login?message=Invalid credentials');
        }

        const user = results[0];
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                console.error('Bcrypt compare error:', err);
                return res.status(500).send('Server error');
            }

            if (isMatch) {
                req.session.user = username;
                res.redirect('/index');
            } else {
                res.redirect(`/login?message=true`);
            }
        });
    });
});

// Register logic
app.post('/register', (req, res) => {
    const { username, password } = req.body;

    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            console.error('Bcrypt hash error:', err);
            return res.status(500).send('Server error');
        }

        pool.query('INSERT INTO accounts (username, password) VALUES (?, ?)', [username, hashedPassword], (error) => {
            if (error) {
                console.error('Database insert error:', error);
                return res.status(500).send('Server error');
            }

            res.redirect('/login?success=true');
        });
    });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Get available levels
app.get('/api/get-levels', (req, res) => {
    const query = 'SELECT level_id, level_name FROM level';
    pool.query(query, (error, results) => {
        if (error) {
            console.error('Database query error:', error);
            return res.status(500).json({ error: 'Database query error' });
        }
        res.json(results);
    });
});

// Get quiz questions dynamically
app.get('/api/get-questions/:id', (req, res) => {
    const levelId = req.params.id;
    const query = `
        SELECT 
            question_id, 
            question_desc AS question, 
            answer_1, 
            answer_2, 
            answer_3, 
            correct_answer 
        FROM question 
        WHERE level_id = ?;
    `;

    pool.query(query, [levelId], (error, results) => {
        if (error) {
            console.error('Database query error:', error);
            return res.status(500).json({ error: 'Database query error' });
        }

        const questions = results.map(row => ({
            question: row.question,
            answers: [
                { text: row.answer_1, correct: row.answer_1 === row.correct_answer },
                { text: row.answer_2, correct: row.answer_2 === row.correct_answer },
                { text: row.answer_3, correct: row.answer_3 === row.correct_answer },
                { text: row.correct_answer, correct: row.correct_answer === row.correct_answer }
            ]
        }));

        res.json(questions);
    });
});


// Save score
app.post('/api/save-score', (req, res) => {
    // Ensure user is logged in
    if (!req.session.user) {
        return res.status(401).send({ message: 'Unauthorized: Please log in to save scores' });
    }

    const username = req.session.user; // Get username from session
    const { level_name, score_value } = req.body;

    // Validate inputs
    if (!level_name || score_value === undefined) {
        return res.status(400).send({ message: 'Invalid input: level_name and score_value are required' });
    }

    const query = `
        INSERT INTO score (username, level_name, score_value)
        VALUES (?, ?, ?)
    `;

    pool.query(query, [username, level_name, score_value], (err, result) => {
        if (err) {
            console.error('Error saving score:', err);
            return res.status(500).send({ message: 'Error saving score' });
        }
        res.status(201).send({ message: 'Score saved successfully' });
    });
});

app.get('/api/score', (req, res) => {
    const level_name = req.query.level_name; 
    const username = req.session.user; 

    const sql = `
        SELECT score_value AS highest_score
        FROM score 
        WHERE level_name = ? AND username = ? 
        ORDER BY score_value DESC 
        LIMIT 1
    `;

    pool.query(sql, [level_name, username], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }


        // Check if there’s a result
        if (results.length > 0) {
            res.json({ highest_score: results[0].highest_score });
        } else {
            res.json({ highest_score: "N/A" }); // No score found
        }
    });
});





// Start the server
app.listen(3000, function () {
    console.log('Example app listening on port 3000!');
    console.log('Type localhost:3000/login to access!');
});
