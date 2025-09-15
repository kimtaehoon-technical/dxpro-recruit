// createUser.js
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

async function createUser() {
  await mongoose.connect(process.env.MONGO_URI);

  const username = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASS || "1234";

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    console.log("⚠️ ユーザーが既に存在します:", username);
    return mongoose.disconnect();
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashedPassword, role: "admin" });
  await user.save();

  console.log("✅ 初期管理者ユーザー作成完了:", username, "/", password);
  mongoose.disconnect();
}

createUser();
