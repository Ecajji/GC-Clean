import { db } from "../firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
} from "firebase/firestore";

/* -------------------------------------------------------
 ✅ SHOW ADD FORM (initial render)
------------------------------------------------------- */
export const showAddForm = (req, res) => {
  res.render("add", {
    errors: {},
    values: {},
  });
};

/* -------------------------------------------------------
 ✅ ADD TRASH ENTRY (with validation + preserved input)
------------------------------------------------------- */
export const addTrash = async (req, res) => {
  try {
    const { type, quantity, location, date, collector } = req.body;

    let errors = {};

    // --- FIELD VALIDATIONS ---
    if (!type || !/^[A-Za-z\s]+$/.test(type.trim()))
      errors.type = "Type must contain only letters and spaces.";

    if (!quantity || isNaN(quantity) || quantity <= 0)
      errors.quantity = "Quantity must be a positive number.";

    if (!location || location.trim().length < 3)
      errors.location = "Location must be at least 3 characters long.";

    if (!date) {
      errors.date = "Please select a date.";
    } else {
      const today = new Date();
      const inputDate = new Date(date);
      if (isNaN(inputDate.getTime()) || inputDate > today) {
        errors.date = "Invalid date. Cannot be in the future.";
      }
    }

    if (!collector || !/^[A-Za-z\s]+$/.test(collector.trim()))
      errors.collector = "Collector name must contain only letters and spaces.";

    // --- UNIQUE COLLECTOR CHECK ---
    if (!errors.collector) {
      const q = query(collection(db, "trash"), where("collector", "==", collector.trim()));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        errors.collector = "Collector name already exists.";
      }
    }

    // --- IF THERE ARE ERRORS ---
    if (Object.keys(errors).length > 0) {
      return res.render("add", {
        errors,
        values: req.body, // preserve user input
      });
    }

    // --- ADD DOCUMENT ---
    await addDoc(collection(db, "trash"), {
      type: type.trim(),
      quantity: Number(quantity),
      location: location.trim(),
      date,
      collector: collector.trim(),
      createdAt: new Date().toISOString(),
    });

    req.flash("success_msg", "Trash item added successfully!");
    res.redirect("/leaderboard");
  } catch (err) {
    console.error("Error adding trash:", err);
    req.flash("error_msg", "Server error. Please try again later.");
    res.redirect("/add");
  }
};

/* -------------------------------------------------------
 ✅ AJAX NAME CHECKER
------------------------------------------------------- */
export const checkCollector = async (req, res) => {
  const name = req.query.name;
  const q = query(collection(db, "trash"), where("collector", "==", name));
  const docs = await getDocs(q);
  res.json({ exists: !docs.empty });
};

/* -------------------------------------------------------
 ✅ LEADERBOARD VIEW
------------------------------------------------------- */
export const getLeaderboard = async (req, res) => {
  try {
    const q = query(collection(db, "trash"));
    const snapshot = await getDocs(q);

    const totals = {};
    snapshot.forEach((doc) => {
      const data = doc.data();
      const collector = data.collector || "Unknown";
      const qty = Number(data.quantity) || 0;
      totals[collector] = (totals[collector] || 0) + qty;
    });

    const leaderboard = Object.entries(totals)
      .map(([collector, total]) => ({ collector, total }))
      .sort((a, b) => b.total - a.total);

    res.render("leaderboard", { leaderboard });
  } catch (err) {
    console.error("Error loading leaderboard:", err);
    res.status(500).send("Error loading leaderboard.");
  }
};
