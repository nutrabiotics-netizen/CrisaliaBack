const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://localhost:27017/crisalia');
  const boxes = await mongoose.connection.collection('boxconsultorios').find({}).toArray();
  console.log("BOXES EN MONGO:", boxes);
  process.exit(0);
}
test();
