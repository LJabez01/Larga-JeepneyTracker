const commuterBtn = document.getElementById('commuterBtn');
const driverBtn = document.getElementById('driverBtn');

function loginRedirect(page) {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    if (email === '' || password === '') {
        alert('Please fill in both email and password.');
        return false;
    }

    // Redirect to the selected page
    window.location.href = page;
}

// Add click event listeners
commuterBtn.addEventListener('click', function(e) {
    e.preventDefault(); // Prevent default anchor behavior
    loginRedirect('../mainpage/commuter.html');
});

driverBtn.addEventListener('click', function(e) {
    e.preventDefault();
    loginRedirect('../mainpage/driver.html');
});