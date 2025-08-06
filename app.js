const fs = require('node:fs');
const express = require('express');


const app = express();
const port = process.env.PORT;

// Middleware for static files
app.use(express.static('public'));
app.use(express.json());



function readpath(path) {
    try {
        return fs.readFileSync(__dirname + '/' + path + '/index.html', 'utf8');
    } catch (error) {
        throw error;
    }
}
function site(path) {
    try {
        return fs.readFileSync(__dirname + '/' + path + ".html", 'utf8');
    } catch (error) {
        throw error;
    }
}
function readfile(path) {
    try {
        return fs.readFileSync(__dirname + '/' + path, 'utf8');
    } catch (error) {
        throw error;
    }
}





// -- Routes
app.get('/', (req, res) => {
	res.end(readpath("/"));
});

app.get('/projects', (req, res) => {
	res.end(site("projects"));
});

app.get('/banners', (req, res) => {
	res.end(site("banners"));
});
app.get('/keyfile', (req, res) => {
	res.end(readfile("/old-website/keyfile"));
});




app.use("/fonts", express.static("assets/fonts"));
app.use("/banners", express.static("assets/88x31"));
app.use("/old", express.static("old-website"));

// -- Files
app.get('/theme.css', (req, res) => {
	res.end(readfile("node_modules/snes.css/dist/snes.css"));
});
app.get('/styles.css', (req, res) => {
	res.end(readfile("/styles.css"));
});



// --- Redirects ---
app.get('/search', (req, res) => {
    res.statusCode = 301;
    res.setHeader('Location', 'https://s.liforra.de');
    res.end();
});
app.get('/vault', (req, res) => {
    res.statusCode = 301;
    res.setHeader('Location', 'https://v.liforra.de');
    res.end();
});




app.get('/api/test', (req, res) => {
    res.json({ message: 'API working!', timestamp: new Date() });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://127.0.0.1:${port}`);
});


