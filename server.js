const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.static('public'));

// ROOT
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// DB
mongoose.connect(process.env.MONGO_URL)
.then(()=>console.log("MongoDB Connected"))
.catch(err=>console.log(err));

// SCHEMA
const User = mongoose.model("User", new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  approved: { type: Boolean, default: false }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  sender: String,
  receiver: String,
  text: String,
  image: String,
  time: { type: Date, default: Date.now }
}));

// UPLOAD
const storage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,'public/uploads'),
  filename:(req,file,cb)=>cb(null,Date.now()+path.extname(file.originalname))
});
const upload = multer({storage});

app.post('/upload', upload.single('file'), (req,res)=>{
  res.json({file:req.file.filename});
});

// SIGNUP
app.post('/signup', async (req, res) => {
  const { name, phone } = req.body;

  const exist = await User.findOne({ phone });
  if (exist) return res.json({ msg: "Already registered" });

  await User.create({ name, phone });
  res.json({ msg: "Registered! Wait for admin approval" });
});

// LOGIN
app.post('/login', async (req, res) => {
  const { phone } = req.body;

  const user = await User.findOne({ phone });

  if (!user) return res.json({ success:false, msg:"User not registered" });
  if (!user.approved) return res.json({ success:false, msg:"Wait for admin approval" });

  res.json({ success:true, name:user.name });
});

// ADMIN
app.get('/pending', async (req,res)=>{
  const users = await User.find({ approved:false });
  res.json(users);
});

app.post('/approve', async (req,res)=>{
  const { phone } = req.body;
  await User.updateOne({ phone }, { $set:{ approved:true } });
  res.json({ msg:"Approved" });
});

// USERS
app.get('/users', async (req,res)=>{
  const users = await User.find({ approved:true });
  res.json(users);
});

// MESSAGES
app.get('/messages/:user/:target', async (req,res)=>{
  const { user, target } = req.params;

  let msgs;

  if(target==="group"){
    msgs = await Message.find({ receiver:"group" });
  }else{
    msgs = await Message.find({
      $or:[
        { sender:user, receiver:target },
        { sender:target, receiver:user }
      ]
    });
  }

  res.json(msgs);
});

// SOCKET
io.on('connection', socket => {

  socket.on('join', user => {
    socket.user = user;
  });

  socket.on('send', async data => {
    const msg = await Message.create(data);
    io.emit('receive', msg);
  });

  socket.on('offer', d=>socket.broadcast.emit('offer',d));
  socket.on('answer', d=>socket.broadcast.emit('answer',d));
  socket.on('ice-candidate', d=>socket.broadcast.emit('ice-candidate',d));
});

// START
const PORT = process.env.PORT || 3000;

server.listen(PORT, ()=>{
  console.log("Server running on port " + PORT);
});
