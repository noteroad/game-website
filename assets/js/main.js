const yearTargets = document.querySelectorAll("#year");
const currentYear = new Date().getFullYear();

yearTargets.forEach((target) => {
  target.textContent = currentYear;
});

const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector("#site-menu");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}
