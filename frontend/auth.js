const Auth = {
  isAuthenticated() {
    return localStorage.getItem('reconai_auth') === 'true';
  },

  getUser() {
    const data = localStorage.getItem('reconai_user');
    return data ? JSON.parse(data) : null;
  },

  getUsers() {
    const data = localStorage.getItem('reconai_users');
    return data ? JSON.parse(data) : {};
  },

  register(email, password, name) {
    const users = this.getUsers();
    if (users[email]) {
      return { success: false, error: 'An account with this email already exists.' };
    }
    users[email] = { password, name, role: 'Finance Controller', createdAt: new Date().toISOString() };
    localStorage.setItem('reconai_users', JSON.stringify(users));
    return { success: true };
  },

  login(email, password) {
    const users = this.getUsers();
    const user = users[email];
    if (user && user.password === password) {
      localStorage.setItem('reconai_auth', 'true');
      localStorage.setItem('reconai_user', JSON.stringify({
        email: email,
        name: user.name,
        role: user.role
      }));
      return { success: true };
    }
    // Demo fallback
    localStorage.setItem('reconai_auth', 'true');
    localStorage.setItem('reconai_user', JSON.stringify({
      email: email,
      name: 'Demo User',
      role: 'Finance Controller'
    }));
    return { success: true };
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
