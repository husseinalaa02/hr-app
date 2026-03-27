import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getPayslips, getPayslip } from '../api/payslips';
import { Skeleton } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { formatIQD } from '../utils/format';

const COMPANY = import.meta.env.VITE_DEFAULT_COMPANY || 'AFAQ ALFIKER';

function PayslipDetail({ payslip, onClose }) {
  const { t, i18n } = useTranslation();
  const { addToast } = useToast();

  if (!payslip) return null;

  const fmt = (n) => formatIQD(n);

  const printPayslip = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) {
      addToast(t('common.printNotSupported', { defaultValue: 'Printing is not supported on this device.' }), 'error');
      return;
    }
    const dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
    const lbl = {
      employee:        t('payslips.employee'),
      employeeId:      t('payslips.employeeId'),
      period:          t('payslips.period'),
      payslipNo:       t('payslips.payslipTitle'),
      allAmountsIQD:   t('payslips.allAmountsIQD'),
      earnings:        t('payslips.earnings'),
      amount:          t('common.amount'),
      grossPay:        t('payslips.grossPay'),
      deductions:      t('payslips.deductions'),
      totalDeductions: t('payslips.totalDeductions'),
      netPay:          t('payslips.netPay'),
      to:              t('common.to'),
    };
    printWin.document.write(`
      <!DOCTYPE html>
      <html dir="${dir}">
      <head>
        <title>${lbl.payslipNo} - ${payslip.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; direction: ${dir}; }
          h1 { color: #0C447C; }
          .header { display: flex; justify-content: space-between; margin-bottom: 24px; }
          .currency-note { font-size: 12px; color: #888; margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th { background: #0C447C; color: white; padding: 8px 12px; text-align: start; }
          td { padding: 8px 12px; border-bottom: 1px solid #eee; }
          td:last-child { text-align: end; }
          .total-row td { font-weight: bold; background: #f5f5f5; }
          .net-pay { font-size: 24px; color: #0C447C; font-weight: bold; margin-top: 24px; text-align: end; border-top: 2px solid #0C447C; padding-top: 12px; }
        </style>
      </head>
      <body>
        <h1>${COMPANY}</h1>
        <div class="header">
          <div>
            <p><strong>${lbl.employee}:</strong> ${payslip.employee_name}</p>
            <p><strong>${lbl.employeeId}:</strong> ${payslip.employee}</p>
          </div>
          <div>
            <p><strong>${lbl.period}:</strong> ${payslip.start_date} ${lbl.to} ${payslip.end_date}</p>
            <p><strong>${lbl.payslipNo}:</strong> ${payslip.name}</p>
          </div>
        </div>
        <p class="currency-note">${lbl.allAmountsIQD}</p>
        <table>
          <thead><tr><th>${lbl.earnings}</th><th style="text-align:end">${lbl.amount}</th></tr></thead>
          <tbody>
            ${(payslip.earnings || []).map(e => `<tr><td>${e.salary_component}</td><td style="text-align:end">${Number(e.amount).toLocaleString('en-US')}</td></tr>`).join('')}
            <tr class="total-row"><td>${lbl.grossPay}</td><td style="text-align:end">${Number(payslip.gross_pay || 0).toLocaleString('en-US')}</td></tr>
          </tbody>
        </table>
        <table style="margin-top: 16px">
          <thead><tr><th>${lbl.deductions}</th><th style="text-align:end">${lbl.amount}</th></tr></thead>
          <tbody>
            ${(payslip.deductions || []).map(d => `<tr><td>${d.salary_component}</td><td style="text-align:end">${Number(d.amount).toLocaleString('en-US')}</td></tr>`).join('')}
            <tr class="total-row"><td>${lbl.totalDeductions}</td><td style="text-align:end">${Number(payslip.total_deduction || 0).toLocaleString('en-US')}</td></tr>
          </tbody>
        </table>
        <p class="net-pay">${lbl.netPay}: ${Number(payslip.net_pay || 0).toLocaleString('en-US')} IQD</p>
      </body>
      </html>
    `);
    printWin.document.close();
    printWin.print();
  };

  return (
    <Modal title={`${t('payslips.payslipTitle')} — ${payslip.name}`} onClose={onClose} size="lg">
      <div className="payslip-detail">
        <div className="payslip-info-row">
          <div>
            <p><strong>{t('payslips.employee')}:</strong> {payslip.employee_name}</p>
            <p><strong>{t('payslips.period')}:</strong> {payslip.start_date} {t('common.to')} {payslip.end_date}</p>
            <p className="currency-tag">{t('payslips.allAmountsIQD')}</p>
          </div>
          <button className="btn btn-secondary" onClick={printPayslip}>🖨 {t('payslips.print')}</button>
        </div>

        <div className="payslip-tables">
          <div>
            <h4>{t('payslips.earnings')}</h4>
            <table className="data-table">
              <thead><tr><th>{t('payslips.component')}</th><th style={{ textAlign: 'end' }}>{t('common.amount')}</th></tr></thead>
              <tbody>
                {(payslip.earnings || []).map((e, i) => (
                  <tr key={i}>
                    <td>{e.salary_component}</td>
                    <td style={{ textAlign: 'end' }}>{fmt(e.amount)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td><strong>{t('payslips.grossPay')}</strong></td>
                  <td style={{ textAlign: 'end' }}><strong>{fmt(payslip.gross_pay)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h4>{t('payslips.deductions')}</h4>
            <table className="data-table">
              <thead><tr><th>{t('payslips.component')}</th><th style={{ textAlign: 'end' }}>{t('common.amount')}</th></tr></thead>
              <tbody>
                {(payslip.deductions || []).map((d, i) => (
                  <tr key={i}>
                    <td>{d.salary_component}</td>
                    <td style={{ textAlign: 'end' }}>{fmt(d.amount)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td><strong>{t('payslips.totalDeductions')}</strong></td>
                  <td style={{ textAlign: 'end' }}><strong>{fmt(payslip.total_deduction)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="net-pay-row">
          <span>{t('payslips.netPay')}</span>
          <span className="net-pay-value">{fmt(payslip.net_pay)}</span>
        </div>
      </div>
    </Modal>
  );
}

export default function Payslips() {
  const { t } = useTranslation();
  const { employee } = useAuth();
  const { addToast } = useToast();
  const [payslips, setPayslips] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setError(null);
    try {
      setPayslips(await getPayslips(employee.name));
    } catch (e) {
      setError(e.message || t('errors.failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [employee?.name]);

  useEffect(() => { load(); }, [load]);

  const handleView = async (name) => {
    setLoadingDetail(name);
    try { setSelected(await getPayslip(name)); }
    catch (e) { addToast(e.message || t('errors.failedLoad'), 'error'); }
    finally { setLoadingDetail(null); }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('payslips.title')}</h1>
          <p className="page-subtitle">{t('payslips.subtitle')}</p>
        </div>
      </div>
      {error && <ErrorState message={error} onRetry={load} />}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('payslips.periodRange')}</th>
                <th>{t('payslips.postingDate')}</th>
                <th>{t('payslips.grossPay')}</th>
                <th>{t('payslips.deductions')}</th>
                <th>{t('payslips.netPay')}</th>
                <th>{t('common.status')}</th>
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
                <tr><td colSpan={7} className="text-center text-muted">{t('payslips.noPayslips')}</td></tr>
              ) : payslips.map((p) => (
                <tr key={p.name}>
                  <td>{p.start_date} → {p.end_date}</td>
                  <td>{p.posting_date}</td>
                  <td>{formatIQD(p.gross_pay)}</td>
                  <td>{formatIQD(p.total_deduction)}</td>
                  <td><strong>{formatIQD(p.net_pay)}</strong></td>
                  <td><Badge status={p.status || 'Submitted'} /></td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleView(p.name)} disabled={loadingDetail === p.name}>
                      {loadingDetail === p.name ? <span className="spinner-sm" /> : t('payslips.viewPayslip')}
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
