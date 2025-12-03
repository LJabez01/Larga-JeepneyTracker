// PAGE SWITCHING
const menuItems = document.querySelectorAll(".menu-item");
const pages = document.querySelectorAll(".page");

menuItems.forEach(item => {
    item.addEventListener("click", () => {

        menuItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");

        let target = item.getAttribute("data-page");

        pages.forEach(page => {
            page.classList.remove("active");
            if (page.id === target) page.classList.add("active");
        });
    });
});

