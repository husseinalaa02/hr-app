import client from './client';

export async function login(usr, pwd) {
  const res = await client.post('/api/method/login', { usr, pwd });
  return res.data;
}

export async function logout() {
  await client.get('/api/method/logout');
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_info');
}

export async function getLoggedInUser() {
  const res = await client.get('/api/method/frappe.auth.get_logged_user');
  return res.data.message;
}

export async function getEmployeeForUser(userEmail) {
  const res = await client.get('/api/resource/Employee', {
    params: {
      filters: JSON.stringify([['user_id', '=', userEmail]]),
      fields: JSON.stringify([
        'name', 'employee_name', 'department', 'designation',
        'cell_number', 'image', 'user_id', 'company', 'date_of_joining',
        'gender', 'date_of_birth', 'employment_type', 'branch',
      ]),
      limit: 1,
    },
  });
  return res.data.data?.[0] || null;
}
