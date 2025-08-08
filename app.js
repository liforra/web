const fs = require('node:fs');
const express = require('express');
const { exec } = require('child_process');
const { request } = require('node:http');
const { execSync } = require("child_process");
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
function isServiceUp(url) {
    try {
    execSync(`curl -Is --max-time 5 ${url} | head -n 1 | grep "200"`, {
        stdio: "ignore",
    });
    console.log("I'm able to reach " + url)
    return true;
    } catch {
        console.log("I'm not able to reach " + url)
    return false;
    }
}



// -- Routes
app.get('/', (req, res) => {
	res.end(readpath("/"));
});

app.get("/projects", (req, res) => {
    let html = site("projects");
    console.log("Im running more then once")
    const services = {
        SEARCH_CLASS: isServiceUp("https://search.liforra.de/") ? "online" : "offline",
        VAULT_CLASS: isServiceUp("https://v.liforra.de/") ? "online" : "offline",
        TOOLS_CLASS: isServiceUp("https://nerds.liforra.de/") ? "online" : "offline",
        CLOUD_CLASS: isServiceUp("https://cloud.liforra.de/") ? "online" : "offline",
    };

    for (const [placeholder, status] of Object.entries(services)) {
    html = html.replace(`{{${placeholder}}}`, status);
    }

    res.end(html);
});

app.get('/banners', (req, res) => {
	res.end(site("banners"));
});
app.get('/keyfile', (req, res) => {
	res.end(readfile("/old-website/keyfile"));
});



// -- Folders
app.use("/fonts", express.static("assets/fonts"));
app.use("/banners", express.static("assets/88x31"));
app.use("/old", express.static("old-website"));
app.use("/assets/tor", express.static("assets/tor"));

// -- Files
app.get('/theme.css', (req, res) => {
    res.setHeader('Content-Type','text/css')
	res.end(readfile("node_modules/snes.css/dist/snes.css"));
});
app.get('/styles.css', (req, res) => {
    res.setHeader('Content-Type','text/css')
	res.end(readfile("/styles.css"));
});


app.get('/checkDomain', (req, res) => {
    res.setHeader('Content-Type','text/css')
    if(req.header('Host') == "liforra.de") {
        res.send(readfile("conditionalFiles/main.css"))
    } else if (req.header('Host') == "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion") {
        res.send(readfile("conditionalFiles/onion.css"))
    } else if (req.header('Host') == "q3hpmogpmbv25pdvrceqr3ku454el4xam3u2iugooywfdsb5khea.b32.i2p") {
        res.send(readfile("conditionalFiles/i2p.css"))
    } else {
        res.send(readfile("conditionalFiles/unknown.css"))
    }
    res.end()
});





// --- Redirects ---


app.get("/redir", (req, res) => {
  const targetUrl = req.query.url || "";

  // Load redir.html
    let html = site("redir")
    // Replace {{URL}} with the provided URL
    html = html.replace(/{{URL}}/g, targetUrl);

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });




app.get('/search', (req, res) => {
    res.statusCode = 301;
    if (req.header('Host') == "liforra.de") {
        res.setHeader('Location', 'https://s.liforra.de');
        
    } else if (req.header('Host') == "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion") {
        res.setHeader('Location', "http://2hj2tgkzj4w2kbwlt37ymk5z3lq7dskygw5qr5awmkx76p67yu3qn7qd.onion/")
    } else {
        res.setHeader('Location', '/redir?url=https%3A%2F%2Fs.liforra.de')
    }
    res.end();
});
app.get('/vault', (req, res) => {
    res.statusCode = 301;
    if (req.header('Host') == "liforra.de") {
        res.setHeader('Location', 'https://v.liforra.de');
        
    } else if (req.header('Host') == "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion") {
        res.setHeader('Location', "http://lostzizeuqb5vfv5sab5xtaigzuhavd6itaalcj466uygav744klxtad.onion")
    } else {
        res.setHeader('Location', '/redir?url=https%3A%2F%2Fv.liforra.de')
    }
    res.end();
});
app.get('/nerds', (req, res) => {
    res.statusCode = 301;
    if (req.header('Host') == "liforra.de") {
        res.setHeader('Location', 'https://nerds.liforra.de');
        
    } else if (req.header('Host') == "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion") {
        res.setHeader('Location', "http://ifspoug4hzpkj27ujfbekcwpcenx5hb4ggbk6xii7xhwmmmbug5jtlyd.onion")
    } else {
        res.setHeader('Location', '/redir?url=https%3A%2F%2Ftools.liforra.de')
    }
    res.end();
});

app.get('/t', (req, res) => {
    res.statusCode = 301;
    if (req.header('Host') == "liforra.de") {
        res.setHeader('Location', 'https://t.liforra.de');
        
    } else if (req.header('Host') == "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion") {
        res.setHeader('Location', "http://saroor4xo6hlelunsrxkohpowpsm6arzl6n45bvzkxf5p6b2ivlcuaid.onion")
    } else {
        res.setHeader('Location', 'https://liforra.de/error?error=host')
    }
    res.end();
});

app.get('/relay', (req, res) => {
    res.statusCode = 301;
    if (req.header('Host') == "liforra.de") {
        res.setHeader('Location', 'https://metrics.torproject.org/rs.html#details/F30158BE186234337774F3FC9E5956F01B1DDBE6');
    } else if (req.header('Host') == "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion") {
        res.setHeader('Location', "http://hctxrvjzfpvmzh2jllqhgvvkoepxb4kfzdjm6h7egcwlumggtktiftid.onion/rs.html#details/F30158BE186234337774F3FC9E5956F01B1DDBE6")
    } else {
        res.setHeader('Location', 'https://liforra.de/error?error=host')
    }
    res.end();
});



//app.get('', (req, res) => {
//    res.statusCode = 301;
//    if (req.header('Host') == "liforra.de") {
//        res.setHeader('Location', 'https://.liforra.de');
//        
//    } else if (req.header('Host') == "ekbyky7ey2d7arb7q6uctyaf4vhb72zlcpsdokmscsdpe6vvwcrrtkid.onion") {
//        res.setHeader('Location', "")
//    } else {
//        res.setHeader('Location', 'https://liforra.de/error?error=host')
//    }
//    res.end();
//});






app.get('/tools', (req, res) => {
    res.statusCode = 301;
    res.setHeader('Location', 'https://nerds.liforra.de');
    res.end();
});


// -- API ---
app.post('/updatesite', (req, res) => {
    exec('git pull', (err, stdout, stderr) => {
    if (err) {
        res.statusCode = 500;
        res.end(stderr)
        return;
    } else {
        res.statusCode = 200;
        res.end(stdout)
    }
    
    // the *entire* stdout and stderr (buffered)
    console.log(`${stdout}`);
    console.log(`${stderr}`);
    });
});
app.get('/api/test', (req, res) => {
    res.json({ message: 'API working!', timestamp: new Date() });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
});


// TODO: Adjust sizes of html to fit nicer