const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://127.0.0.1:27017/quan_ly';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to DB');
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({}).toArray();
    console.log('Users found:', users.map(u => ({ username: u.username, ho_ten: u.ho_ten, role_id: u.role_id })));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
