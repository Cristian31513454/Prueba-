const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
const db = new sqlite3.Database(path.join(__dirname, 'focus-pet.sqlite'), (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Initialize tables
    db.serialize(() => {
      // User stats & Pet state
      db.run(`CREATE TABLE IF NOT EXISTS user_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coins INTEGER DEFAULT 0,
        total_focus_time INTEGER DEFAULT 0,
        pet_name TEXT DEFAULT 'Pixel',
        pet_level INTEGER DEFAULT 1,
        pet_xp INTEGER DEFAULT 0,
        pet_happiness INTEGER DEFAULT 100,
        pet_hat TEXT DEFAULT 'none',
        pet_background TEXT DEFAULT 'default'
      )`);

      // Focus session history
      db.run(`CREATE TABLE IF NOT EXISTS focus_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        duration INTEGER,
        mode TEXT
      )`);

      // Inventory for accessories
      db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id TEXT UNIQUE,
        owned INTEGER DEFAULT 0
      )`);

      // Insert default user if none exists
      db.get('SELECT COUNT(*) as count FROM user_data', [], (err, row) => {
        if (!err && row.count === 0) {
          db.run("INSERT INTO user_data (coins, total_focus_time, pet_name, pet_level, pet_xp, pet_happiness) VALUES (0, 0, 'Pixel', 1, 0, 100)");
        }
      });
    });
  }
});

// API Routes

// Get user and pet status
app.get('/api/user', (req, res) => {
  db.get('SELECT * FROM user_data LIMIT 1', [], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(row || {});
  });
});

// Update user and pet status (coins, xp, level, happiness, etc.)
app.post('/api/user/update', (req, res) => {
  const { coins, total_focus_time, pet_level, pet_xp, pet_happiness, pet_name, pet_hat, pet_background } = req.body;
  
  // Dynamically build update query
  const updates = [];
  const params = [];
  
  if (coins !== undefined) { updates.push('coins = ?'); params.push(coins); }
  if (total_focus_time !== undefined) { updates.push('total_focus_time = ?'); params.push(total_focus_time); }
  if (pet_level !== undefined) { updates.push('pet_level = ?'); params.push(pet_level); }
  if (pet_xp !== undefined) { updates.push('pet_xp = ?'); params.push(pet_xp); }
  if (pet_happiness !== undefined) { updates.push('pet_happiness = ?'); params.push(pet_happiness); }
  if (pet_name !== undefined) { updates.push('pet_name = ?'); params.push(pet_name); }
  if (pet_hat !== undefined) { updates.push('pet_hat = ?'); params.push(pet_hat); }
  if (pet_background !== undefined) { updates.push('pet_background = ?'); params.push(pet_background); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const query = `UPDATE user_data SET ${updates.join(', ')} WHERE id = 1`;
  
  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'User updated successfully' });
  });
});

// Log a focus session
app.post('/api/focus/log', (req, res) => {
  const { duration, mode } = req.body; // duration in minutes, mode: 'focus' or 'break'
  if (!duration || !mode) {
    return res.status(400).json({ error: 'Duration and mode are required' });
  }

  db.serialize(() => {
    // Insert history record
    db.run(
      'INSERT INTO focus_history (duration, mode, timestamp) VALUES (?, ?, datetime("now", "localtime"))',
      [duration, mode],
      (err) => {
        if (err) {
          console.error('Error logging focus session:', err.message);
        }
      }
    );

    // If it was a focus session, update total focus time and award coins/XP
    if (mode === 'focus') {
      const earnedCoins = Math.floor(duration * 2); // 2 coins per minute
      const earnedXP = duration * 10; // 10 XP per minute

      db.get('SELECT coins, total_focus_time, pet_xp, pet_level FROM user_data LIMIT 1', [], (err, user) => {
        if (!err && user) {
          let newXP = user.pet_xp + earnedXP;
          let newLevel = user.pet_level;
          let nextLevelXP = newLevel * 100; // Formula for leveling up

          while (newXP >= nextLevelXP) {
            newXP -= nextLevelXP;
            newLevel += 1;
            nextLevelXP = newLevel * 100;
          }

          const newCoins = user.coins + earnedCoins;
          const newTime = user.total_focus_time + duration;

          db.run(
            'UPDATE user_data SET coins = ?, total_focus_time = ?, pet_xp = ?, pet_level = ? WHERE id = 1',
            [newCoins, newTime, newXP, newLevel],
            (err) => {
              if (err) {
                console.error('Error updating user achievements:', err.message);
              }
            }
          );
        }
      });
    }
  });

  res.status(201).json({ message: 'Session logged' });
});

// Get focus history stats (e.g., last 7 days)
app.get('/api/history', (req, res) => {
  db.all(
    `SELECT DATE(timestamp) as date, SUM(duration) as total_duration 
     FROM focus_history 
     WHERE mode = 'focus' 
     GROUP BY DATE(timestamp) 
     ORDER BY date DESC 
     LIMIT 7`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// Get inventory items
app.get('/api/inventory', (req, res) => {
  db.all('SELECT * FROM inventory', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Buy item
app.post('/api/shop/buy', (req, res) => {
  const { item_id, price } = req.body;
  if (!item_id || price === undefined) {
    return res.status(400).json({ error: 'Item ID and price are required' });
  }

  db.get('SELECT coins FROM user_data LIMIT 1', [], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!user || user.coins < price) {
      return res.status(400).json({ error: 'Insufficient coins' });
    }

    const newCoins = user.coins - price;

    db.serialize(() => {
      // Deduct coins
      db.run('UPDATE user_data SET coins = ? WHERE id = 1', [newCoins]);
      
      // Add or update inventory
      db.run(
        'INSERT INTO inventory (item_id, owned) VALUES (?, 1) ON CONFLICT(item_id) DO UPDATE SET owned = 1',
        [item_id]
      );
    });

    res.json({ message: 'Purchase successful', remaining_coins: newCoins });
  });
});

// Serve frontend html on all fallback routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Focus-Pet server running on port ${PORT}`);
});
