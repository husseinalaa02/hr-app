import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getPayslips, getPayslip } from '../api/payslips';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { formatIQD } from '../utils/format';

const COMPANY = import.meta.env.VITE_DEFAULT_COMPANY || 'Afaq Al-Fiker';

function PayslipDetail({ payslip, onClose }) {
  if (!payslip) return null;

  const fmt = (n) => formatIQD(n);

  const printPayslip = () => {
    const printWin = window.open('', '_blank');
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payslip - ${payslip.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; direction: ltr; }
          h1 { color: #0C447C; }
          .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
          .currency-note { font-size: 12px; color: #888; margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th { background: #0C447C; color: white; padding: 8px 12px; text-align: left; }
          td { padding: 8px 12px; border-bottom: 1px solid #eee; }
          td:last-child { text-align: right; }
          .total-row td { font-weight: bold; background: #f5f5f5; }
          .net-pay { font-size: 24px; color: #0C447C; font-weight: bold; margin-top: 24px; text-align: right; border-top: 2px solid #0C447C; padding-top: 12px; }
        </style>
      </head>
      <body>
        <h1>${COMPANY}</h1>
        <div class="header">
          <div>
            <p><strong>Employee:</strong> ${payslip.employee_name}</p>
            <p><strong>ID:</strong> ${payslip.employee}</p>
          </div>
          <div>
            <p><strong>Period:</strong> ${payslip.start_date} to ${payslip.end_date}</p>
            <p><strong>Payslip No:</strong> ${payslip.name}</p>
          </div>
        </div>
        <p class="currency-note">All amounts in Iraqi Dinar (IQD)</p>
        <table>
          <thead><tr><th>Earnings</th><th style="text-align:right">Amount (IQD)</th></tr></thead>
          <tbody>
            ${(payslip.earnings || []).map(e => `<tr><td>${e.salary_component}</td><td style="text-align:right">${Number(e.amount).toLocaleString('en-US')}</td></tr>`).join('')}
            <tr class="total-row"><td>Gross Pay</td><td style="text-align:right">${Number(payslip.gross_pay || 0).toLocaleString('en-US')}</td></tr>
          </tbody>
        </table>
        <table style="margin-top: 16px">
          <thead><tr><th>Deductions</th><th style="text-align:right">Amount (IQD)</th></tr></thead>
          <tbody>
            ${(payslip.deductions || []).map(d => `<tr><td>${d.salary_component}</td><td style="text-align:right">${Number(d.amount).toLocaleString('en-US')}</td></tr>`).join('')}
            <tr class="total-row"><td>Total Deductions</td><td style="text-align:right">${Number(payslip.total_deduction || 0).toLocaleString('en-US')}</td></tr>
          </tbody>
        </table>
        <p class="net-pay">Net Pay: ${Number(payslip.net_pay || 0).toLocaleString('en-US')} IQD</p>
      </body>
      </html>
    `);
    printWin.document.close();
    printWin.print();
  };

  return (
    <Modal title={`Payslip — ${payslip.name}`} onClose={onClose} size="lg">
      <div className="payslip-detail">
        <div className="payslip-info-row">
          <div>
            <p><strong>Employee:</strong> {payslip.employee_name}</p>
            <p><strong>Period:</strong> {payslip.start_date} to {payslip.end_date}</p>
            <p className="currency-tag">All amounts in IQD</p>
          </div>
          <button className="btn btn-secondary" onClick={printPayslip}>🖨 Print / PDF</button>
        </div>

        <div className="payslip-tables">
          <div>
            <h4>Earnings</h4>
            <table className="data-table">
              <thead><tr><th>Component</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {(payslip.earnings || []).map((e, i) => (
                  <tr key={i}>
                    <td>{e.salary_component}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(e.amount)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td><strong>Gross Pay</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(payslip.gross_pay)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h4>Deductions</h4>
            <table className="data-table">
              <thead><tr><th>Component</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {(payslip.deductions || []).map((d, i) => (
                  <tr key={i}>
                    <td>{d.salary_component}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(d.amount)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td><strong>Total Deductions</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(payslip.total_deduction)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="net-pay-row">
          <span>Net Pay</span>
          <span className="net-pay-value">{fmt(payslip.net_pay)}</span>
        </div>
      </div>
    </Modal>
  );
}

export default function Payslips() {
  const { employee } = useAuth();
  const [payslips, setPayslips] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setError(null);
    try {
      setPayslips(await getPayslips(employee.name));
    } catch (e) {
      setError(e.message || 'Failed to load payslips');
    } finally {
      setLoading(false);
    }
  }, [employee?.name]);

  useEffect(() => { load(); }, [load]);

  const handleView = async (name) => {
    setLoadingDetail(true);
    try { setSelected(await getPayslip(name)); } catch {}
    setLoadingDetail(false);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Payslips</h1>
          <p className="page-subtitle">View and download your salary statements</p>
        </div>
      </div>
      {error && <ErrorState message={error} onRetry={load} />}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Posting Date</th>
                <th>Gross Pay</th>
                <th>Deductions</th>
                <th>Net Pay</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><Skeleton height={14} /></td>
                    ))}
                  </tr>
                ))
              ) : payslips.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted">No payslips found</td></tr>
              ) : payslips.map((p) => (
                <tr key={p.name}>
                  <td>{p.start_date} → {p.end_date}</td>
                  <td>{p.posting_date}</td>
                  <td>{formatIQD(p.gross_pay)}</td>
                  <td>{formatIQD(p.total_deduction)}</td>
                  <td><strong>{formatIQD(p.net_pay)}</strong></td>
                  <td><Badge status={p.status || 'Submitted'} /></td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleView(p.name)} disabled={loadingDetail}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <PayslipDetail payslip={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
