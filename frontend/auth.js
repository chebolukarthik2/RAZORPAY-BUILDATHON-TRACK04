const Auth = {
  isAuthenticated() {
    return localStorage.getItem('reconai_auth') === 'true';
  },

  getUser() {
    const data = localStorage.getItem('reconai_user');
    return data ? JSON.parse(data) : null;
  },

  login(email, password) {
    localStorage.setItem('reconai_auth', 'true');
    localStorage.setItem('reconai_user', JSON.stringify({
      email: email,
      name: 'Demo User',
      role: 'Finance Controller'
    }));
  },

  logout() {
    localStorage.removeItem('reconai_auth');
    localStorage.removeItem('reconai_user');
    window.location.href = '/login.html';
  },

  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }
};
