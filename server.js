const express = require("express");
const bodyParser = require("body-parser");
const db = require("./firebase");
const session = require("express-session");
const flash = require("connect-flash");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = 3000;

// View engine and middleware setup
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(
  session({
    secret: "gc-clean-secret",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(flash());

// Flash + session globals
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.user = req.session.user;
  next();
});

// 🔒 Auth Middleware
function ensureAuth(req, res, next) {
  if (!req.session.user) {
    req.flash("error_msg", "Please log in first.");
    return res.redirect("/login");
  }
  next();
}

/* -------------------------------------------------------
   AUTH ROUTES
------------------------------------------------------- */

// 🟢 Register Page
app.get("/register", (req, res) => {
  res.render("register");
});

// 🟢 Handle Register
app.post("/register", async (req, res) => {
  const { name, email, password, department } = req.body;

  // Check for existing email
  const userRef = db.collection("users");
  const existing = await userRef.where("email", "==", email).get();

  if (!existing.empty) {
    req.flash("error_msg", "Email already registered.");
    return res.redirect("/register");
  }

  // Hash password and save
  const hashedPassword = await bcrypt.hash(password, 10);
  await userRef.add({ name, email, password: hashedPassword, department });

  req.flash("success_msg", "Registration successful! Please log in.");
  res.redirect("/login");
});

// 🟡 Login Page
app.get("/login", (req, res) => {
  res.render("login");
});

// 🟡 Handle Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const snapshot = await db.collection("users").where("email", "==", email).get();

  if (snapshot.empty) {
    req.flash("error_msg", "User not found.");
    return res.redirect("/login");
  }

  const userDoc = snapshot.docs[0];
  const user = userDoc.data();
  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    req.flash("error_msg", "Invalid password.");
    return res.redirect("/login");
  }

  // Save user in session
  req.session.user = {
    id: userDoc.id,
    name: user.name,
    department: user.department,
    email: user.email,
  };

  req.flash("success_msg", `Welcome ${user.name}!`);
  res.redirect("/");
});

// 🔴 Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

/* -------------------------------------------------------
   CRUD ROUTES (Protected)
------------------------------------------------------- */

// 🟢 Home - Display all trash (per user) + total
app.get("/", ensureAuth, async (req, res) => {
  const user = req.session.user;

  const snapshot = await db
    .collection("trash")
    .where("userId", "==", user.id)
    .get();

  const trashList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  // Calculate total quantity
  const total = trashList.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  res.render("index", { trashList, total });
});

// 🟢 Add Trash Form
app.get("/add", ensureAuth, (req, res) => res.render("add"));

// 🟢 Save Trash
app.post("/add", ensureAuth, async (req, res) => {
  const { type, quantity, location, date } = req.body;
  const { id, name, department } = req.session.user;

  await db.collection("trash").add({
    type,
    quantity,
    location,
    date,
    collector: name,
    department,
    userId: id,
  });

  res.redirect("/");
});

// 🟡 Edit Trash Form
app.get("/edit/:id", ensureAuth, async (req, res) => {
  const doc = await db.collection("trash").doc(req.params.id).get();
  if (!doc.exists) return res.redirect("/");
  res.render("edit", { id: doc.id, data: doc.data() });
});

// 🟡 Update Trash
app.post("/edit/:id", ensureAuth, async (req, res) => {
  const { type, quantity, location, date } = req.body;
  await db
    .collection("trash")
    .doc(req.params.id)
    .update({ type, quantity, location, date });
  res.redirect("/");
});

// 🔴 Delete Trash
app.get("/delete/:id", ensureAuth, async (req, res) => {
  await db.collection("trash").doc(req.params.id).delete();
  res.redirect("/");
});

/* -------------------------------------------------------
   LEADERBOARD ROUTES
------------------------------------------------------- */

// 🏆 Department Filtered Leaderboard
app.get("/leaderboard", ensureAuth, async (req, res) => {
  const snapshot = await db.collection("trash").get();
  const data = snapshot.docs.map((doc) => doc.data());

  const deptFilter = req.query.dept || "all";

  const filtered =
    deptFilter === "all"
      ? data
      : data.filter((item) => item.department === deptFilter);

  // Count total quantity per collector
  const leaderboard = {};
  filtered.forEach((item) => {
    const name = item.collector || "Unknown";
    leaderboard[name] =
      (leaderboard[name] || 0) + Number(item.quantity || 0);
  });

  // Convert to sorted array
  const sorted = Object.entries(leaderboard)
    .map(([collector, total]) => ({ collector, total }))
    .sort((a, b) => b.total - a.total);

  // Get unique departments
  const departments = [...new Set(data.map((d) => d.department).filter(Boolean))];

  res.render("leaderboard", { sorted, departments, deptFilter });
});

/* -------------------------------------------------------
   SERVER
------------------------------------------------------- */

app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
