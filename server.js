const express = require("express");
const bodyParser = require("body-parser");
const db = require("./firebase");
const session = require("express-session");
const flash = require("connect-flash");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = 3000;

/* -------------------------------------------------------
   APP SETUP
------------------------------------------------------- */
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

// Flash + session locals
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.user = req.session.user;
  next();
});

// Auth guard
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

// 🟢 Register (strict school email)
app.get("/register", (req, res) => res.render("register", { errors: {}, values: {} }));

app.post("/register", async (req, res) => {
  const { name, email, password, department } = req.body;
  let errors = {};

  try {
    // ✅ School email pattern: 9 digits + @gordoncollege.edu.ph
    const schoolEmailRegex = /^[0-9]{9}@gordoncollege\.edu\.ph$/i;
    if (!email || !schoolEmailRegex.test(email.trim())) {
      errors.email = "Please use your school email (e.g., 202311512@gordoncollege.edu.ph)";
    }

    if (!name || name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters long.";
    }

    if (!password || password.length < 6) {
      errors.password = "Password must be at least 6 characters long.";
    }

    if (!department || department.trim() === "") {
      errors.department = "Please select your department.";
    }

    // If validation errors, show form again
    if (Object.keys(errors).length > 0) {
      return res.render("register", { errors, values: req.body });
    }

    // ✅ Check for existing user (case-insensitive)
    const usersRef = db.collection("users");
    const existing = await usersRef
      .where("email", "==", email.trim().toLowerCase())
      .get();

    if (!existing.empty) {
      errors.email = "Email already registered.";
      return res.render("register", { errors, values: req.body });
    }

    // ✅ Hash password and save
    const hashed = await bcrypt.hash(password, 10);
    await usersRef.add({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
      department: department.trim(),
    });

    req.flash("success_msg", "Registration successful! Please log in.");
    res.redirect("/login");
  } catch (err) {
    console.error("Register error:", err);
    req.flash("error_msg", "Error registering user.");
    res.redirect("/register");
  }
});

// 🟡 Login (strict validation)
app.get("/login", (req, res) => res.render("login", { errors: {}, values: {} }));

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  let errors = {};

  try {
    // ✅ Validate school email
    const schoolEmailRegex = /^[0-9]{9}@gordoncollege\.edu\.ph$/i;
    if (!email || !schoolEmailRegex.test(email.trim())) {
      errors.email = "Please use your valid school email (e.g., 202311512@gordoncollege.edu.ph)";
    }

    if (!password) {
      errors.password = "Password is required.";
    }

    if (Object.keys(errors).length > 0) {
      return res.render("login", { errors, values: req.body });
    }

    // ✅ Look up user
    const snapshot = await db
      .collection("users")
      .where("email", "==", email.trim().toLowerCase())
      .get();

    if (snapshot.empty) {
      errors.email = "No account found with that email.";
      return res.render("login", { errors, values: req.body });
    }

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    // ✅ Password check
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      errors.password = "Incorrect password.";
      return res.render("login", { errors, values: req.body });
    }

    // ✅ Session save
    req.session.user = {
      id: userDoc.id,
      name: user.name,
      email: user.email,
      department: user.department,
    };

    req.flash("success_msg", `Welcome ${user.name}!`);
    res.redirect("/");
  } catch (err) {
    console.error("Login error:", err);
    req.flash("error_msg", "Login failed. Please try again later.");
    res.redirect("/login");
  }
});

// 🔴 Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

/* -------------------------------------------------------
   CRUD ROUTES (Protected)
------------------------------------------------------- */

// 🏠 Dashboard
app.get("/", ensureAuth, async (req, res) => {
  const user = req.session.user;
  const snapshot = await db.collection("trash").where("userId", "==", user.id).get();
  const trashList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const total = trashList.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  res.render("index", { trashList, total });
});

// ➕ Add Trash Form
app.get("/add", ensureAuth, (req, res) => res.render("add", { errors: {}, values: {} }));

// 🧾 Add Trash with Validation
app.post("/add", ensureAuth, async (req, res) => {
  const { type, quantity, location, date, collector } = req.body;
  const { id: userId, department } = req.session.user;
  let errors = {};

  try {
    if (!type || !/^[A-Za-z\s]+$/.test(type.trim()))
      errors.type = "Type must contain only letters and spaces.";

    if (!quantity || isNaN(quantity) || quantity <= 0)
      errors.quantity = "Quantity must be a positive number.";

    if (!location || location.trim().length < 3)
      errors.location = "Location must be at least 3 characters long.";

    // 🗓️ Date validation (not before 2024 / not in future)
    if (!date) {
      errors.date = "Please select a date.";
    } else {
      const inputDate = new Date(date);
      const today = new Date();
      const minDate = new Date("2024-01-01");
      inputDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      if (isNaN(inputDate.getTime()))
        errors.date = "Invalid date format.";
      else if (inputDate > today)
        errors.date = "Date cannot be in the future.";
      else if (inputDate < minDate)
        errors.date = "Date cannot be before 2024.";
    }

    if (!collector || !/^[A-Za-z\s]+$/.test(collector.trim()))
      errors.collector = "Collector name must contain only letters and spaces.";

    const existing = await db.collection("trash").where("collector", "==", collector.trim()).get();
    if (!existing.empty) errors.collector = "Collector name already exists.";

    if (Object.keys(errors).length > 0)
      return res.render("add", { errors, values: req.body });

    await db.collection("trash").add({
      type: type.trim(),
      quantity: Number(quantity),
      location: location.trim(),
      date,
      collector: collector.trim(),
      department,
      userId,
      createdAt: new Date().toISOString(),
    });

    req.flash("success_msg", "Trash entry added successfully!");
    res.redirect("/leaderboard");
  } catch (err) {
    console.error("Add error:", err);
    req.flash("error_msg", "Error saving trash entry.");
    res.redirect("/add");
  }
});

// ✏️ Edit Form
app.get("/edit/:id", ensureAuth, async (req, res) => {
  const doc = await db.collection("trash").doc(req.params.id).get();
  if (!doc.exists) return res.redirect("/");
  res.render("edit", { id: doc.id, data: doc.data(), errors: {}, values: {} });
});

// 🧠 Update Trash (with date validation)
app.post("/edit/:id", ensureAuth, async (req, res) => {
  const { type, quantity, location, date } = req.body;
  let errors = {};

  try {
    if (!type || !/^[A-Za-z\s]+$/.test(type.trim()))
      errors.type = "Type must contain only letters and spaces.";
    if (!quantity || isNaN(quantity) || quantity <= 0)
      errors.quantity = "Quantity must be a positive number.";
    if (!location || location.trim().length < 3)
      errors.location = "Location must be at least 3 characters long.";

    const inputDate = new Date(date);
    const today = new Date();
    const minDate = new Date("2024-01-01");
    inputDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    if (!date) errors.date = "Please select a date.";
    else if (isNaN(inputDate.getTime()))
      errors.date = "Invalid date format.";
    else if (inputDate > today)
      errors.date = "Date cannot be in the future.";
    else if (inputDate < minDate)
      errors.date = "Date cannot be before 2024.";

    if (Object.keys(errors).length > 0) {
      const doc = await db.collection("trash").doc(req.params.id).get();
      return res.render("edit", { id: req.params.id, data: doc.data(), errors, values: req.body });
    }

    await db.collection("trash").doc(req.params.id).update({
      type: type.trim(),
      quantity: Number(quantity),
      location: location.trim(),
      date,
    });

    req.flash("success_msg", "Trash entry updated!");
    res.redirect("/");
  } catch (err) {
    console.error("Update error:", err);
    req.flash("error_msg", "Error updating entry.");
    res.redirect("/");
  }
});

// 🗑️ Delete
app.get("/delete/:id", ensureAuth, async (req, res) => {
  try {
    await db.collection("trash").doc(req.params.id).delete();
    req.flash("success_msg", "Entry deleted successfully!");
  } catch (err) {
    console.error("Delete error:", err);
    req.flash("error_msg", "Error deleting entry.");
  }
  res.redirect("/");
});

/* -------------------------------------------------------
   LEADERBOARD ROUTES
------------------------------------------------------- */
app.get("/leaderboard", ensureAuth, async (req, res) => {
  try {
    const deptFilter = req.query.dept || "all";
    const snapshot = await db.collection("trash").get();
    const data = snapshot.docs.map((doc) => doc.data());
    const filtered =
      deptFilter === "all" ? data : data.filter((item) => item.department === deptFilter);
    const leaderboard = {};

    filtered.forEach((item) => {
      const name = item.collector || "Unknown";
      leaderboard[name] = (leaderboard[name] || 0) + Number(item.quantity || 0);
    });

    const sorted = Object.entries(leaderboard)
      .map(([collector, total]) => ({ collector, total }))
      .sort((a, b) => b.total - a.total);

    const departments = [...new Set(data.map((d) => d.department).filter(Boolean))];

    res.render("leaderboard", { sorted, departments, deptFilter });
  } catch (err) {
    console.error("Leaderboard error:", err);
    req.flash("error_msg", "Error loading leaderboard.");
    res.redirect("/");
  }
});

/* -------------------------------------------------------
   SERVER START
------------------------------------------------------- */
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
