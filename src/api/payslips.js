import client from './client';
import { db } from '../db/index';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export async function getPayslips(employeeId) {
  if (DEMO) {
    return db.payslips.where('employee').equals(employeeId)
      .reverse().sortBy('posting_date');
  }
  try {
    const res = await client.get('/api/resource/Salary Slip', {
      params: {
        fields: JSON.stringify(['name','employee','employee_name','posting_date','start_date','end_date','gross_pay','total_deduction','net_pay','status','currency']),
        filters: JSON.stringify([['employee','=',employeeId]]),
        order_by: 'posting_date desc', limit: 50,
      },
    });
    const data = res.data.data;
    await db.payslips.bulkPut(data);
    return data;
  } catch {
    return db.payslips.where('employee').equals(employeeId).toArray();
  }
}

export async function getPayslip(name) {
  if (DEMO) {
    return db.payslips.get(name);
  }
  try {
    const res = await client.get(`/api/resource/Salary Slip/${name}`);
    const data = res.data.data;
    await db.payslips.put(data);
    return data;
  } catch {
    return db.payslips.get(name);
  }
}
