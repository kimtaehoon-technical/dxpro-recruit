const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },

  // 基本情報
  lastName: { type: String, required: true },
  firstName: { type: String, required: true },
  hurilastName: { type: String, required: true },
  hurifirstName: { type: String, required: true },
  birthdate: { type: Date, required: true },

  // 新卒 / 中途
  employmentType: { type: String, enum: ["newGrad", "midCareer"], required: true },

  // 新卒用
  graduationSchool: { type: String },
  expectedGraduation: { type: String }, // YYYY-MM 形式

  // 中途用
  hasCurrentJob: { type: Boolean },
  expectedResignation: { type: Date },
  desiredJoinDate: { type: Date },

  email: { type: String, required: true },
  phone: { type: String, required: true },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);
