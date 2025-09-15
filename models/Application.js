// models/Application.js
const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  user: { type: String, required: true }, // "応募者" or "人事担当者"
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const applicationSchema = new mongoose.Schema({
  type: String,
  firstName: String,
  lastName: String,
  email: String,
  position: String,
  status: String,
  createdAt: { type: Date, default: Date.now },
  chat: [chatSchema] // チャット履歴を配列で保持
});

module.exports = mongoose.model('Application', applicationSchema);
