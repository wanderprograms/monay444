import { firebaseConfig, sendToAirtel, sendToTNM } from './api/configAndApis.js';

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let notifications = [];

document.addEventListener("DOMContentLoaded", () => {
  // UI Switching
  function showRegister() {
    document.getElementById('registerSection').style.display = 'block';
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('dashboard').style.display = 'none';
  }

  function showLogin() {
    document.getElementById('registerSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
  }

  function showDashboard() {
    document.getElementById('registerSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderDashboard();
  }

  function clearErrors() {
    document.getElementById('registerError').textContent = '';
    document.getElementById('loginError').textContent = '';
    document.getElementById('sendMoneyError').textContent = '';
    document.getElementById('sendMoneySuccess').textContent = '';
  }

  // Button Listeners
  document.getElementById('showLoginBtn').addEventListener('click', showLogin);
  document.getElementById('showRegisterBtn').addEventListener('click', showRegister);

  // Register
  document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    clearErrors();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('emailRegister').value.trim();
    const phone = document.getElementById('phoneRegister').value.trim();
    const password = document.getElementById('passwordRegister').value;

    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const uid = userCredential.user.uid;

      await db.collection("users").doc(uid).set({
        firstName,
        lastName,
        email,
        phone,
        balance: 10000,
        notifications: []
      });

      alert("Registration successful! Please login.");
      showLogin();
      this.reset();
    } catch (error) {
      document.getElementById('registerError').textContent = error.message;
    }
  });

  // Login
  document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    clearErrors();

    const identifier = document.getElementById('identifierLogin').value.trim();
    const password = document.getElementById('passwordLogin').value;

    try {
      let email = identifier;
      if (!identifier.includes("@")) {
        email = `${identifier}@wanderslapp.com`;
      }

      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      currentUser = userCredential.user.uid;
      showDashboard();
      this.reset();
    } catch (error) {
      document.getElementById('loginError').textContent = error.message;
    }
  });

  // Dashboard
  async function renderDashboard() {
    const doc = await db.collection("users").doc(currentUser).get();
    const data = doc.data();

    document.getElementById('balance').textContent = `Balance: MK ${data.balance.toFixed(2)}`;
    notifications = data.notifications || [];
    document.getElementById('notificationIcon').setAttribute('data-count', notifications.length);
    document.getElementById('messages').innerHTML = notifications.map(n =>
      `<div><strong>${n.from}:</strong> ${n.message}</div>`
    ).join('');
  }

  // Clear Notifications
  document.getElementById('notificationIcon').addEventListener('click', async () => {
    await db.collection("users").doc(currentUser).update({ notifications: [] });
    notifications = [];
    renderDashboard();
  });

  // Send Money
  document.getElementById('sendMoneyForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    clearErrors();

    const recipientPhone = document.getElementById('recipientPhone').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const accountType = document.getElementById('accountType').value;

    if (!recipientPhone || isNaN(amount) || amount <= 0 || !accountType) {
      document.getElementById('sendMoneyError').textContent = 'Please enter valid details.';
      return;
    }

    try {
      const senderRef = db.collection("users").doc(currentUser);
      const senderDoc = await senderRef.get();
      const senderData = senderDoc.data();

      if (senderData.balance < amount) {
        document.getElementById('sendMoneyError').textContent = 'Insufficient balance.';
        return;
      }

      await senderRef.update({ balance: senderData.balance - amount });

      if (accountType === 'user') {
        const recipientQuery = await db.collection("users")
          .where("phone", "==", recipientPhone)
          .limit(1)
          .get();

        if (recipientQuery.empty) {
          document.getElementById('sendMoneyError').textContent = 'Recipient user not found.';
          return;
        }

        const recipientRef = recipientQuery.docs[0].ref;
        const recipientData = recipientQuery.docs[0].data();

        await recipientRef.update({
          balance: recipientData.balance + amount,
          notifications: firebase.firestore.FieldValue.arrayUnion({
            from: senderData.firstName,
            message: `Wakutumizilani MK ${amount.toFixed(2)}.`,
            timestamp: new Date().toISOString()
          })
        });
      }

      if (accountType === 'airtel') {
        const result = await sendToAirtel(recipientPhone, amount);
        if (!result || result.success === false) {
          document.getElementById('sendMoneyError').textContent = 'Airtel API failed.';
          return;
        }
      }

      if (accountType === 'tnm') {
        const result = await sendToTNM(recipientPhone, amount);
        if (!result || result.success === false) {
          document.getElementById('sendMoneyError').textContent = 'TNM API failed.';
          return;
        }
      }

      document.getElementById('sendMoneySuccess').textContent =
        `Money sent to ${accountType.toUpperCase()} successfully.`;
      renderDashboard();
      this.reset();
    } catch (error) {
      document.getElementById('sendMoneyError').textContent = error.message;
    }
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await auth.signOut();
    currentUser = null;
    notifications = [];
    showLogin();
  });

  // Default view
  showLogin();
});
