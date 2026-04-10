"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import styles from './DashboardOverview.module.css';

interface Expense {
  id: string;
  date: string;
  user: string;
  description: string;
  amount: number;
}

interface Payment {
  id: string;
  date: string;
  client: string;
  project: string;
  amount: number;
}

interface DashboardOverviewProps {
  cashFlow: number;
  bankBalance: number;
  pendingExpenses: Expense[];
  pendingPayments: Payment[];
  isHealthStable: boolean;
  hasOutdatedBankStatements?: boolean;
  hasExpiredFDs?: boolean;
  uncheckedTransactionsCount?: number;
  uncheckedAccountsBreakdown?: { account_id: number; count: number }[];
  accounts?: { id: number; name: string }[];
  totalFDAmount?: number;
  totalProjectReceivables?: number;
  totalEmployeePayable?: number;
  expensesTableNode: React.ReactNode;
  paymentsTableNode: React.ReactNode;
  bankStatementsNode?: React.ReactNode;
  onOpenCreateUser: () => void;
  onOpenCreateAccount: () => void;
  onOpenCreateProject: () => void;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

export default function DashboardOverview({
  cashFlow,
  bankBalance,
  pendingExpenses,
  pendingPayments,
  isHealthStable,
  hasOutdatedBankStatements = false,
  hasExpiredFDs = false,
  uncheckedTransactionsCount = 0,
  uncheckedAccountsBreakdown = [],
  accounts = [],
  totalFDAmount = 0,
  totalProjectReceivables = 0,
  totalEmployeePayable = 0,
  expensesTableNode,
  paymentsTableNode,
  bankStatementsNode,
  onOpenCreateUser,
  onOpenCreateAccount,
  onOpenCreateProject,
}: DashboardOverviewProps) {
  const [showUncheckedModal, setShowUncheckedModal] = useState(false);

  return (
    <div className={styles.container}>
      {/* Header and Quick Actions */}
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard Overview</h1>
        <div className={styles.quickActions}>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onOpenCreateUser}>Create User</button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onOpenCreateAccount}>Add Account</button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onOpenCreateProject}>Create Project</button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        {hasOutdatedBankStatements && (
          <div 
            className={`${styles.card} ${styles.cardDanger}`} 
            style={{ border: '2px solid #ef4444', backgroundColor: '#fef2f2', cursor: 'pointer' }}
            onClick={() => document.getElementById('bank-statements-section')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <div className={styles.cardTitle} style={{ color: '#b91c1c' }}>Attention Needed</div>
            <div className={styles.cardValue} style={{ fontSize: '18px', color: '#991b1b' }}>Outdated Bank Statements</div>
          </div>
        )}
        {hasExpiredFDs && (
          <div 
            className={`${styles.card} ${styles.cardDanger}`} 
            style={{ border: '2px solid #ef4444', backgroundColor: '#fef2f2', cursor: 'pointer' }}
            onClick={() => window.location.href = '/bank'}
          >
            <div className={styles.cardTitle} style={{ color: '#b91c1c' }}>Attention Needed</div>
            <div className={styles.cardValue} style={{ fontSize: '18px', color: '#991b1b' }}>Expired Fixed Deposits</div>
          </div>
        )}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Cashflow</div>
          <div className={`${styles.cardValue} ${cashFlow >= 0 ? styles.cardGood : styles.cardDanger}`}>
            {cashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow)}
          </div>
        </div>
        <div 
          className={styles.card} 
          onClick={() => window.location.href = '/bank'}
          style={{ cursor: 'pointer' }}
        >
          <div className={styles.cardTitle}>Total Fixed Deposits</div>
          <div className={styles.cardValue}>{formatCurrency(totalFDAmount)}</div>
        </div>
        <div 
          className={styles.card}
          onClick={() => window.location.href = '/projects'}
          style={{ cursor: 'pointer' }}
        >
          <div className={styles.cardTitle}>Project Receivables</div>
          <div className={styles.cardValue}>{formatCurrency(totalProjectReceivables)}</div>
        </div>
        <div 
          className={styles.card}
          onClick={() => window.location.href = '/employees'}
          style={{ cursor: 'pointer' }}
        >
          <div className={styles.cardTitle}>Employee Payable</div>
          <div className={styles.cardValue}>{formatCurrency(totalEmployeePayable)}</div>
        </div>
        <div 
          className={styles.card}
          onClick={() => document.getElementById('pending-payments-section')?.scrollIntoView({ behavior: 'smooth' })}
          style={{ cursor: 'pointer' }}
        >
          <div className={styles.cardTitle}>Pending Client Payments</div>
          <div className={`${styles.cardValue} ${pendingPayments.length > 0 ? styles.cardWarning : styles.cardGood}`}>
            {pendingPayments.length} Awaiting
          </div>
        </div>
        <div 
          className={styles.card}
          onClick={() => document.getElementById('pending-expenses-section')?.scrollIntoView({ behavior: 'smooth' })}
          style={{ cursor: 'pointer' }}
        >
          <div className={styles.cardTitle}>Pending Expenses</div>
          <div className={`${styles.cardValue} ${pendingExpenses.length > 0 ? styles.cardDanger : styles.cardGood}`}>
            {pendingExpenses.length} Awaiting
          </div>
        </div>
        <div 
          className={styles.card} 
          onClick={() => uncheckedTransactionsCount > 0 && setShowUncheckedModal(true)}
          style={{ cursor: uncheckedTransactionsCount > 0 ? 'pointer' : 'default' }}
        >
          <div className={styles.cardTitle}>Unchecked Entries</div>
          <div className={`${styles.cardValue} ${uncheckedTransactionsCount > 0 ? styles.cardWarning : styles.cardGood}`}>
            {uncheckedTransactionsCount} Unchecked
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Health Check</div>
          <div className={`${styles.cardValue} ${isHealthStable ? styles.cardGood : styles.cardDanger}`}>
            {isHealthStable ? 'Stable' : 'Unstable Issues Found'}
          </div>
        </div>
      </div>

      {/* Urgent Approvals - Pending Expenses */}
      <section className={styles.section} id="pending-expenses-section">
        <h2 className={styles.sectionTitle}>Urgent Approvals: Pending Expenses</h2>
        <div className={styles.tableContainer}>
          {expensesTableNode}
        </div>
      </section>

      {/* Urgent Approvals - Pending Client Payments */}
      <section className={styles.section} id="pending-payments-section">
        <h2 className={styles.sectionTitle}>Urgent Approvals: Pending Client Payments</h2>
        <div className={styles.tableContainer}>
          {paymentsTableNode}
        </div>
      </section>

      {/* Bank Statements Node */}
      {bankStatementsNode && (
        <section className={styles.section} id="bank-statements-section">
          <div className={styles.tableContainer}>
            {bankStatementsNode}
          </div>
        </section>
      )}

      {/* Floating Window (Modal) for Unchecked Accounts */}
      {showUncheckedModal && (
        <div className={styles.modalOverlay} onClick={() => setShowUncheckedModal(false)}>
          <div className={styles.modalContainer} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Accounts with Unchecked Entries</h2>
              <button className={styles.closeBtn} onClick={() => setShowUncheckedModal(false)}>✕</button>
            </div>
            <div className={styles.modalContent}>
              {uncheckedAccountsBreakdown.length > 0 ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Unchecked Entries</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uncheckedAccountsBreakdown.map((item, idx) => {
                      const account = accounts.find(a => a.id === item.account_id);
                      return (
                        <tr key={idx}>
                          <td>{account ? account.name : `Account #${item.account_id}`}</td>
                          <td>{item.count}</td>
                          <td>
                            <Link href={`/account/${item.account_id}`}>
                              <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}>
                                View Account
                              </button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p>No unchecked entries found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
