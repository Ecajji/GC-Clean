document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");

  form.addEventListener("submit", async (e) => {
    const type = form.type.value.trim();
    const date = form.date.value;
    const collector = form.collector.value.trim();

    // Validate type
    if (!/^[A-Za-z\s]+$/.test(type)) {
      alert("Type must contain only letters and spaces.");
      e.preventDefault();
      return;
    }

    // Validate collector
    if (!/^[A-Za-z\s]+$/.test(collector)) {
      alert("Collector name must contain only letters and spaces.");
      e.preventDefault();
      return;
    }

    // Validate date
    const today = new Date();
    const inputDate = new Date(date);
    if (isNaN(inputDate) || inputDate > today) {
      alert("Please enter a valid date (not in the future).");
      e.preventDefault();
      return;
    }

    // Check collector uniqueness via backend
    try {
      const res = await fetch(`/check-collector?name=${encodeURIComponent(collector)}`);
      const data = await res.json();
      if (data.exists) {
        alert("Collector name already exists! Please use another name.");
        e.preventDefault();
      }
    } catch (err) {
      console.error("Error checking collector name:", err);
    }
  });
});
