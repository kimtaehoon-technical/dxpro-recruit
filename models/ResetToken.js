const mongoose = require('mongoose');

const ResetTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  token: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600, // 1時間で有効期限切れ
  },
});

module.exports = mongoose.model('ResetToken', ResetTokenSchema);