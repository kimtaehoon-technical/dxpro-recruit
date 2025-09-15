const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");
const i18next = require("i18next");
const i18nextMiddleware = require("i18next-http-middleware");
const Backend = require("i18next-fs-backend");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");
const fs = require("fs");
const upload = multer({ dest: "uploads/" }); // 임시 저장 폴더

const User = require("./models/User");
const Application = require("./models/Application");
const NewgradApplication = require("./models/NewgradApplication");
const CareerApplication = require("./models/CareerApplication");
const Contact = require("./models/Contact");
require("dotenv").config();

const app = express();

// MongoDB 연결
mongoose.connect("mongodb+srv://dxprosol:kim650323@dxpro.ealx5.mongodb.net/dxpro-recruit");

// 세션 설정
app.use(session({
  secret: "dxpro_secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: "mongodb+srv://dxprosol:kim650323@dxpro.ealx5.mongodb.net/dxpro-recruit" })
}));

// 다국어 설정
i18next
  .use(Backend)
  .use(i18nextMiddleware.LanguageDetector)
  .init({
    fallbackLng: "jp",
    preload: ["jp", "kr", "en"],
    backend: {
      loadPath: path.join(__dirname, "locales/{{lng}}/translation.json")
    }
  });

app.use(i18nextMiddleware.handle(i18next));

// JSON 파서
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 로그인 필수 미들웨어 (페이지 접근용)
function requireLoginPage(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login.html?msg=login_required");
  }
  next();
}

// 보호할 페이지들
const protectedPages = [
  "/index.html",
  "/contact.html",
  "/application-case.html",
  "/application-detail.html",
  "/application-status.html",
  "/account.html",
  "/application-case.html",
  "/career.html",
  "/new.html",
  "/recruit.html",
  "/settings.html",
  "/position-detail.html",
  "/position-detail2.html", 
  "/position-detail3.html",
  "/position-detail4.html",
  "/",
  ""
];

// 정적 파일보다 먼저 실행
app.use((req, res, next) => {
  if (protectedPages.includes(req.path)) {
    return requireLoginPage(req, res, next);
  }
  next();
});

// 정적 파일
app.use(express.static("public"));

// 로그인 API
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });

  if (!user) return res.redirect("/login.html?msg=login_failed");
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.redirect("/login.html?msg=login_failed");

  req.session.userId = user._id;
  req.session.userRole = user.role;

  res.redirect(`/index.html?msg=login_success&role=${user.role}`);
});

// 신규 사용자 등록 API
app.post("/register", async (req, res) => {
  const {
    username, password,
    lastName, firstName, hurilastName, hurifirstName,
    birthdate, phone, email,
    employmentType, // "newGrad" または "midCareer"
    graduationSchool, expectedGraduation, // 新卒用
    hasCurrentJob, expectedResignation, desiredJoinDate // 中途用
  } = req.body;

  // ユーザー名重複チェック
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(400).send("このユーザー名は既に存在します");
  }

  // パスワードハッシュ化
  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = new User({
    username,
    password: hashedPassword,
    lastName,
    firstName,
    hurilastName,
    hurifirstName,
    birthdate,
    phone,
    email,
    role: "user",
    employmentType,
    // 新卒用
    graduationSchool: employmentType === "newGrad" ? graduationSchool : undefined,
    expectedGraduation: employmentType === "newGrad" ? expectedGraduation : undefined,
    // 中途用
    hasCurrentJob: employmentType === "midCareer" ? hasCurrentJob === "on" : undefined,
    expectedResignation: employmentType === "midCareer" && hasCurrentJob === "on" ? expectedResignation : undefined,
    desiredJoinDate: employmentType === "midCareer" && hasCurrentJob === "on" ? desiredJoinDate : undefined
  });

  await newUser.save();
  console.log("新規ユーザー登録:", username);
  res.redirect("/login.html?msg=register_success");
});


// 로그아웃
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html?msg=logout_success");
  });
});

// 관리자 이메일
const ADMIN_EMAIL = "kim_taehoon@dxpro-sol.com";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,          // STARTTLS を使う場合は false
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false // 自己署名証明書でも接続できる
  },
  connectionTimeout: 10000  // 10秒
});


transporter.verify((err, success) => {
  if (err) console.error("認証エラー:", err);
  else console.log("接続成功!");
});

const positionMap = {
  frontend: "フロントエンド",
  backend: "バックエンド",
  designer: "UIデザイナー",
  pm: "プロジェクトマネージャー",
  consultant: "コンサルタント",
  qaengineer: "QAエンジニア"
};

// 이메일 전송 공통 함수
async function sendApplicationEmailNew(fields, files) {
  const attachments = [];
  for (const key in files) {
    if (files[key]) {
      const fileList = Array.isArray(files[key]) ? files[key] : [files[key]];
      fileList.forEach(f => attachments.push({ filename: f.originalname, path: f.path }));
    }
  }

  let textContent = "";

  // 基本情報
  if (fields.lastName || fields.firstName)
    textContent += `名前: ${fields.lastName || ""} ${fields.firstName || ""}\n`;
  if (fields.hurilastName || fields.hurifirstName)
    textContent += `フリガナ: ${fields.hurilastName || ""} ${fields.hurifirstName || ""}\n`;
  if (fields.birthdate) textContent += `生年月日: ${fields.birthdate}\n`;
  if (fields.gender) textContent += `性別: ${fields.gender}\n`;
  if (fields.phone) textContent += `電話: ${fields.phone}\n`;
  if (fields.email) textContent += `メール: ${fields.email}\n`;

  // 住所
  if (!fields.noAddress) {
    if (fields.postalCode) textContent += `郵便番号: ${fields.postalCode}\n`;
    if (fields.prefecture || fields.city || fields.addressDetail)
      textContent += `住所: ${fields.prefecture || ""}${fields.city || ""}${fields.addressDetail || ""}\n`;
  } else {
    textContent += `住所: （記入なし）\n`;
  }

  // 学歴
  if (fields.education) textContent += `学歴: ${fields.education}\n`;
  if (fields.major) textContent += `専攻: ${fields.major}\n`;
  if (fields.graduation) textContent += `卒業予定: ${fields.graduation}\n`;

  // 希望
  const positionMap = { frontend: "フロントエンド", backend: "バックエンド", designer: "デザイナー" };
  if (fields.position) textContent += `希望ポジション: ${positionMap[fields.position] || fields.position}\n`;
  if (fields.locationPreference) textContent += `勤務希望: ${fields.locationPreference}\n`;

  // 添付資料
  if (fields.portfolio) textContent += `GitHub/ポートフォリオ: ${fields.portfolio}\n`;
  if (fields.resume) textContent += `履歴書: 添付あり\n`;
  if (fields.portfolioFiles && fields.portfolioFiles.length > 0) textContent += `作品ファイル: 添付あり (${fields.portfolioFiles.length}件)\n`;

  // 自己PR
  if (fields.pr) {
    const prLines = fields.pr.split(/\r?\n/);
    textContent += "自己PR:\n";
    prLines.forEach(line => {
      textContent += `  ${line}\n`;
    });
  }
  if (fields.motivation) {
    const motivationLines = fields.motivation.split(/\r?\n/);
    textContent += "志望動機:\n";
    motivationLines.forEach(line => {
      textContent += `  ${line}\n`;
    });
  }

  // 同意
  if (fields.consent) textContent += "✔ 応募者本人による事実確認済み\n";

  await transporter.sendMail({
    from: '"DXPRO採用" <kim_taehoon@dxpro-sol.com>',
    to: ADMIN_EMAIL,
    cc: fields.email,
    subject: `【新卒応募】${fields.lastName || ""}${fields.firstName || ""} さんの応募情報`,
    text: textContent,
    attachments
  });

  attachments.forEach(f => fs.unlinkSync(f.path)); // 一時ファイル削除
}

async function sendApplicationEmailCareer(fields, files) {
  const attachments = [];
  for (const key in files) {
    if (files[key]) {
      const fileList = Array.isArray(files[key]) ? files[key] : [files[key]];
      fileList.forEach(f => attachments.push({ filename: f.originalname, path: f.path }));
    }
  }

  let textContent = "";

  // 基本情報
  if (fields.lastName || fields.firstName)
    textContent += `名前: ${fields.lastName || ""} ${fields.firstName || ""}\n`;
  if (fields.hurilastName || fields.hurifirstName)
    textContent += `フリガナ: ${fields.hurilastName || ""} ${fields.hurifirstName || ""}\n`;
  if (fields.birthdate) textContent += `生年月日: ${fields.birthdate}\n`;
  if (fields.gender) textContent += `性別: ${fields.gender}\n`;
  if (fields.phone) textContent += `電話: ${fields.phone}\n`;
  if (fields.email) textContent += `メール: ${fields.email}\n`;

  // 住所
  if (!fields.noAddress) {
    if (fields.postalCode) textContent += `郵便番号: ${fields.postalCode}\n`;
    if (fields.prefecture || fields.city || fields.addressDetail)
      textContent += `住所: ${fields.prefecture || ""}${fields.city || ""}${fields.addressDetail || ""}\n`;
  } else {
    textContent += `住所: （記入なし）\n`;
  }

  // 学歴
  if (fields.education) textContent += `学歴: ${fields.education}\n`;
  if (fields.major) textContent += `専攻: ${fields.major}\n`;
  if (fields.graduation) textContent += `卒業予定: ${fields.graduation}\n`;

  // 現職情報
  if (fields.currentCompany) textContent += `現職: ${fields.currentCompany}\n`;
  if (fields.currentPosition) textContent += `役職: ${fields.currentPosition}\n`;
  if (fields.currentJobDescription) textContent += `仕事内容: ${fields.currentJobDescription}\n`;
  if (fields.experienceYears) textContent += `経験年数: ${fields.experienceYears}年\n`;

  // 希望条件
  const positionMap = {
    frontend: "フロントエンド",
    backend: "バックエンド",
    designer: "UIデザイナー",
    pm: "プロジェクトマネージャー",
    consultant: "コンサルタント",
    qaengineer: "QAエンジニア"
  };
  if (fields.position) textContent += `希望ポジション: ${positionMap[fields.position] || fields.position}\n`;
  if (fields.locationPreference) textContent += `勤務希望: ${fields.locationPreference}\n`;
  if (fields.gold) textContent += `希望年収: ${fields.gold}\n`;

  // 添付資料
  if (fields.resume) textContent += `履歴書: 添付あり\n`;
  if (fields.career) textContent += `職務経歴書: 添付あり\n`;
  if (fields.portfolio) textContent += `GitHub/ポートフォリオ: ${fields.portfolio}\n`;
  if (fields.portfolioFiles && fields.portfolioFiles.length > 0)
    textContent += `作品ファイル: 添付あり (${fields.portfolioFiles.length}件)\n`;

  // 自己PR
  if (fields.pr) {
    textContent += "自己PR:\n";
    fields.pr.split(/\r?\n/).forEach(line => (textContent += `  ${line}\n`));
  }

  // 転職理由
  if (fields.changeReason) {
    textContent += "転職理由:\n";
    fields.changeReason.split(/\r?\n/).forEach(line => (textContent += `  ${line}\n`));
  }

  // 希望入社時期
  if (fields.desiredJoinDate) textContent += `希望入社時期: ${fields.desiredJoinDate}\n`;

  // 同意
  if (fields.consent) textContent += "✔ 応募者本人による事実確認済み\n";

  await transporter.sendMail({
    from: '"DXPRO採用" <kim_taehoon@dxpro-sol.com>',
    to: ADMIN_EMAIL,
    subject: `【キャリア応募】${fields.lastName || ""}${fields.firstName || ""} さんの応募情報`,
    text: textContent,
    attachments
  });

  // 一時ファイル削除
  attachments.forEach(f => fs.unlinkSync(f.path));
}

// 신입 지원
app.post("/apply/newgrad", upload.fields([
  { name: "resume", maxCount: 1 },
  { name: "portfolioFiles", maxCount: 5 }
]), async (req, res) => {
  try {
    const files = req.files || {};
    const appData = {
      userId: req.session.userId || null,
      ...req.body,
      consent: req.body.consent === "on",
      resume: files.resume?.[0]?.path || "",
      portfolioFiles: files.portfolioFiles?.map(f => f.path) || []
    };

    const application = new NewgradApplication(appData);
    await application.save();

    // 입력값 전부 포함해서 메일 전송
    await sendApplicationEmailNew(req.body, files);

    res.json({ status:"success", message:"応募完了しました" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status:"error", message:"送信失敗" });
  }
});

// 경력 지원
app.post("/apply/career", upload.fields([
  { name:"resume", maxCount:1 },
  { name:"career", maxCount:1 },
  { name:"portfolioFiles", maxCount:5 }
]), async (req,res)=>{
  try{
    const files = req.files || {};
    const appData = {
      userId: req.session.userId || null,
      ...req.body,
      consent: req.body.consent === "on",
      resume: files.resume?.[0]?.path || "",
      career: files.career?.[0]?.path || "",
      portfolioFiles: files.portfolioFiles?.map(f=>f.path) || []
    };

    const application = new CareerApplication(appData);
    await application.save();

    // 입력값 전부 포함해서 메일 전송
    await sendApplicationEmailCareer(req.body, files);

    res.json({ status:"success", message:"応募完了しました" });
  }catch(e){
    console.error(e);
    res.status(500).json({ status:"error", message:"送信失敗" });
  }
});

// ログイン必須ミドルウェア
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "ログインが必要です" });
  next();
}

// アカウント設定更新
app.post("/api/user/account", requireLogin, async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    const updateData = { username, email, phone };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await User.findByIdAndUpdate(req.session.userId, updateData);
    res.json({ status: "success", message: "アカウント情報を更新しました" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// 応募設定更新
app.post("/api/user/apply", requireLogin, async (req, res) => {
  try {
    const { employmentType, graduationSchool, expectedGraduation, hasCurrentJob, expectedResignation, desiredJoinDate } = req.body;

    const updateData = {
      employmentType,
      graduationSchool: employmentType === "newGrad" ? graduationSchool : undefined,
      expectedGraduation: employmentType === "newGrad" ? expectedGraduation : undefined,
      hasCurrentJob: employmentType === "midCareer" ? hasCurrentJob === "on" : undefined,
      expectedResignation: employmentType === "midCareer" && hasCurrentJob === "on" ? expectedResignation : undefined,
      desiredJoinDate: employmentType === "midCareer" && hasCurrentJob === "on" ? desiredJoinDate : undefined
    };

    await User.findByIdAndUpdate(req.session.userId, updateData);
    res.json({ status: "success", message: "応募設定を更新しました" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// ユーザー情報取得
app.get("/api/user/me", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).lean();
    if (!user) return res.status(404).json({ error: "ユーザーが存在しません" });
    res.json({ status: "success", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// ユーザー情報更新
app.post("/api/user/me", requireLogin, async (req, res) => {
  try {
    const {
      username, email, phone, password,
      lastName, firstName, hurilastName, hurifirstName, birthdate,
      employmentType, graduationSchool, expectedGraduation,
      hasCurrentJob, expectedResignation, desiredJoinDate
    } = req.body;

    const updateData = {
      username, email, phone,
      lastName, firstName, hurilastName, hurifirstName, birthdate,
      employmentType,
      graduationSchool: employmentType === "newGrad" ? graduationSchool : undefined,
      expectedGraduation: employmentType === "newGrad" ? expectedGraduation : undefined,
      hasCurrentJob: employmentType === "midCareer" ? hasCurrentJob === "on" : undefined,
      expectedResignation: employmentType === "midCareer" && hasCurrentJob === "on" ? expectedResignation : undefined,
      desiredJoinDate: employmentType === "midCareer" && hasCurrentJob === "on" ? desiredJoinDate : undefined
    };

    // パスワード変更
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await User.findByIdAndUpdate(req.session.userId, updateData);
    res.json({ status: "success", message: "ユーザー情報を更新しました" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// 제출 내역 조회
app.get("/api/applications", requireLogin, async (req, res) => {
  try {
    // 新卒応募取得
    const newgradApps = (await NewgradApplication.find({ userId: req.session.userId }).lean())
      .map(app => ({ ...app, type: "新卒" })); // ← type を追加

    // キャリア応募取得
    const careerApps = (await CareerApplication.find({ userId: req.session.userId }).lean())
      .map(app => ({ ...app, type: "中途" })); // ← type を追加

    // 日付順に統合
    const allApps = [...newgradApps, ...careerApps].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ status: "success", applications: allApps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "サーバーエラー" });
  }
});

// 応募詳細取得
app.get("/api/application/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // CareerApplication を検索
    let application = await CareerApplication.findById(id).lean();
    if (application) {
      application.type = "中途"; // type を追加
    }

    // 見つからなければ NewgradApplication を検索
    if (!application) {
      application = await NewgradApplication.findById(id).lean();
      if (application) {
        application.type = "新卒"; // type を追加
      }
    }

    if (!application) {
      return res.json({ status: "error", message: "応募情報が見つかりません" });
    }

    res.json({ status: "success", application });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "サーバーエラー" });
  }
});


// 応募詳細画面 (新卒・キャリア両方対応)
app.get("/applications/:id", requireLogin, async (req, res) => {
  const { id } = req.params;

  try {
    // 新卒応募
    let application = await NewgradApplication.findById(id).lean();
    if (!application) {
      // キャリア応募
      application = await CareerApplication.findById(id).lean();
    }

    if (!application) {
      return res.status(404).send("応募が見つかりません");
    }

    // ここで EJS や Pug 等でレンダリング
    res.send(`
      <html>
        <head>
          <title>応募詳細</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-6">
          <h1 class="text-2xl font-bold mb-4">応募詳細</h1>
          <p>名前: ${application.lastName || ""} ${application.firstName || ""}</p>
          <p>メール: ${application.email || ""}</p>
          <p>応募タイプ: ${application.type || "不明"}</p>
          <p>希望ポジション: ${positionMap[application.position] || application.position || ""}</p>
          <p>ステータス: ${application.status || "送信済み"}</p>
          <a href="/applications.html" class="mt-4 inline-block text-blue-600 hover:underline">戻る</a>
        </body>
      </html>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("サーバーエラー");
  }
});

app.use(express.urlencoded({ extended: true })); // フォーム形式も解析

// お問い合わせ送信
app.post("/contact", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // DBに保存
    const contact = new Contact({ name, email, phone, message });
    await contact.save();

    // 管理者にメール通知
    await transporter.sendMail({
      from: '"DXPROお問い合わせ" <kim_taehoon@dxpro-sol.com>',
      to: ADMIN_EMAIL,
      subject: `【お問い合わせ】${name} さんより`,
      text: `名前: ${name}\nメール: ${email}\n電話: ${phone || "なし"}\n\n本文:\n${message}`
    });

    res.json({ status: "success", message: "お問い合わせを送信しました" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "送信失敗" });
  }
});

// 포트 실행
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));