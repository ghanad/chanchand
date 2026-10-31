"use client";

import React, { useEffect, useState, useCallback } from "react";
import { RunRow, ErrorRow } from "../../types/dashboard";
import { requestJson } from "../../lib/api-client";
import { formatNumber } from "../../lib/formatters";
import { useDashboard } from "../../context/DashboardContext";
import { PanelHead } from "../common/PanelHead";
import { RunTable } from "../tables/RunTable";
import { ErrorTable } from "../tables/ErrorTable";
import { Modal } from "../common/Modal";

export function RunsView() {
  const { isAdmin, setLoading, showToast, refreshTick, runNow, isCollecting } = useDashboard();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, errorsRes] = await Promise.all([
        requestJson<{ rows: RunRow[] }>("/api/runs"),
        requestJson<{ rows: ErrorRow[] }>("/api/errors"),
      ]);
      setRuns(runsRes.rows);
      setErrors(errorsRes.rows);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "خطا در دریافت اطلاعات اجراها و خطاها");
    } finally {
      setLoading(false);
    }
  }, [setLoading, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  const handleConfirmRun = async () => {
    setConfirmModalOpen(false);
    await runNow();
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHead
          title="Runهای اخیر"
          meta={`${formatNumber(runs.length)} run`}
          action={
            isAdmin ? (
              <button
                className="primary-button run-collection-btn"
                type="button"
                onClick={() => setConfirmModalOpen(true)}
                disabled={isCollecting}
                aria-label={isCollecting ? "در حال اجرای جمع‌آوری قیمت‌ها" : "اجرای جمع‌آوری قیمت‌ها"}
              >
                {isCollecting ? (
                  <>
                    <span className="spinner-sm" aria-hidden="true" />
                    <span>در حال اجرا...</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>اجرای جمع‌آوری</span>
                  </>
                )}
              </button>
            ) : null
          }
        />
        <RunTable rows={runs} />
      </section>
      <section className="panel">
        <PanelHead title="خطاهای اخیر" meta={`${formatNumber(errors.length)} خطا`} />
        <ErrorTable rows={errors} />
      </section>

      {/* مودال تأیید اجرای جمع‌آوری قیمت‌ها */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => {
          if (!isCollecting) setConfirmModalOpen(false);
        }}
        title="تأیید اجرای جمع‌آوری قیمت‌ها"
        maxWidth="440px"
      >
        <div className="confirm-modal-content">
          <p className="confirm-modal-text">
            آیا مطمئن هستید که می‌خواهید فرآیند جمع‌آوری قیمت‌ها را اجرا کنید؟
          </p>
          <div className="modal-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setConfirmModalOpen(false)}
              disabled={isCollecting}
            >
              انصراف
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={handleConfirmRun}
              disabled={isCollecting}
            >
              {isCollecting ? "در حال اجرا..." : "تأیید و اجرا"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
