import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  getTeacherNameCookie,
  getStoredTeacherPassword,
  setStoredTeacherPassword,
  clearStoredTeacherPassword,
  getAuthenticatedTeacher,
  normalizeTeacherName,
} from "@/components/RoleSelectDialog";
import { useUserConfig } from "@/contexts/UserConfigContext";
import { ArrowLeft, Eye, EyeOff, Lock, KeyRound, Check, AlertCircle } from "lucide-react";

export default function TeacherAccount() {
  const [, setLocation] = useLocation();
  const { teacherName: ctxTeacherName } = useUserConfig();

  const [teacherName, setTeacherName] = useState<string>(() => {
    const raw = getAuthenticatedTeacher() || ctxTeacherName || getTeacherNameCookie() || "";
    return normalizeTeacherName(raw);
  });

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // 현재 비밀번호 표시 관련
  const [currentPw, setCurrentPw] = useState<string | null>(null);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [isLoadingPw, setIsLoadingPw] = useState(false);
  const [currentPwError, setCurrentPwError] = useState("");

  // body 배경을 강제로 순수 흰색(#ffffff)으로 리셋
  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    const prevBgImage = document.body.style.backgroundImage;
    const prevBgAttachment = document.body.style.backgroundAttachment;

    document.body.style.backgroundColor = "#ffffff";
    document.body.style.backgroundImage = "none";
    document.body.style.backgroundAttachment = "initial";

    return () => {
      document.body.style.backgroundColor = prevBg;
      document.body.style.backgroundImage = prevBgImage;
      document.body.style.backgroundAttachment = prevBgAttachment;
    };
  }, []);

  // 마운트 시 저장된 비밀번호 유효성 검증
  useEffect(() => {
    if (!teacherName) return;
    const stored = getStoredTeacherPassword(teacherName);
    if (!stored) {
      alert("선생님 인증이 필요합니다. 교사 페이지로 이동합니다.");
      setLocation("/teacher");
      return;
    }

    fetch('/api/teacher-password?action=verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherName, password: stored }),
    }).then(res => {
      if (!res.ok) {
        clearStoredTeacherPassword(teacherName);
        alert("선생님 비밀번호가 변경되었거나 인증이 만료되었습니다. 다시 로그인해주세요.");
        setLocation("/teacher");
      }
    }).catch(() => {});
  }, [teacherName, setLocation]);

  const handleBack = () => {
    setLocation("/teacher");
  };

  const handleShowCurrentPassword = async () => {
    if (!teacherName) { setCurrentPwError("선생님 계정명을 확인할 수 없습니다."); return; }
    const stored = getStoredTeacherPassword(teacherName);
    if (!stored) {
      setCurrentPwError("저장된 인증 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }

    setIsLoadingPw(true);
    setCurrentPwError("");
    setCurrentPw(null);
    try {
      const res = await fetch(`/api/teacher-password?name=${encodeURIComponent(teacherName)}`, {
        headers: {
          'X-Teacher-Password': encodeURIComponent(stored || '')
        }
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          clearStoredTeacherPassword(teacherName);
          alert("비밀번호가 변경되었거나 인증이 만료되었습니다. 다시 로그인해주세요.");
          setLocation("/teacher");
          return;
        }
        throw new Error(data.error || "조회 실패");
      }
      setCurrentPw(data.password);
      setShowCurrentPw(true);
    } catch (err: any) {
      setCurrentPwError(err.message || "오류가 발생했습니다.");
    } finally {
      setIsLoadingPw(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!teacherName) {
      setErrorMessage("선생님 계정명을 확인할 수 없습니다.");
      return;
    }

    if (!newPassword.trim()) {
      setErrorMessage("새 비밀번호를 입력해주세요.");
      return;
    }

    if (newPassword.trim() !== confirmPassword.trim()) {
      setErrorMessage("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      return;
    }

    const storedCurrent = getStoredTeacherPassword(teacherName);
    if (!storedCurrent) {
      setErrorMessage("현재 인증 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }

    const confirmed = window.confirm(`"${teacherName}" 선생님의 비밀번호를 변경하시겠습니까?`);
    if (!confirmed) return;

    setIsChanging(true);
    try {
      const res = await fetch("/api/teacher-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teacherName,
          currentPassword: storedCurrent,
          newPassword: newPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          clearStoredTeacherPassword(teacherName);
          alert("현재 비밀번호가 일치하지 않거나 변경되었습니다. 다시 로그인해주세요.");
          setLocation("/teacher");
          return;
        }
        throw new Error(data.error || "비밀번호 변경 실패");
      }

      // 새 비밀번호로 저장소 즉시 갱신
      setStoredTeacherPassword(teacherName, newPassword.trim());
      setMessage(data.message || "비밀번호가 성공적으로 변경되었습니다.");
      setCurrentPw(newPassword.trim());
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
      alert("비밀번호가 성공적으로 변경되었습니다.");
    } catch (err: any) {
      setErrorMessage(err.message || "오류가 발생했습니다.");
      alert(err.message || "오류가 발생했습니다.");
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>돌아가기</span>
          </button>
          <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
            교사 계정
          </span>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-emerald-600" />
              선생님 계정 관리
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              <strong>{teacherName ? `${teacherName} 선생님` : "선생님 (미선택)"}</strong>의 비밀번호를 관리합니다.
            </p>
          </div>

          {!showPasswordForm ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(true);
                    setMessage("");
                    setErrorMessage("");
                    setCurrentPw(null);
                    setCurrentPwError("");
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-sm shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Lock className="w-4 h-4" />
                  비밀번호 변경
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentPw !== null) {
                      setShowCurrentPw(v => !v);
                    } else {
                      handleShowCurrentPassword();
                    }
                  }}
                  disabled={isLoadingPw}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLoadingPw ? (
                    <span>조회 중...</span>
                  ) : currentPw !== null ? (
                    showCurrentPw ? (
                      <>
                        <EyeOff className="w-4 h-4" />
                        <span>비밀번호 숨기기</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        <span>비밀번호 표시</span>
                      </>
                    )
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      <span>현재 비밀번호 표시</span>
                    </>
                  )}
                </button>
              </div>

              {/* 현재 비밀번호 표시 영역 */}
              {currentPwError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{currentPwError}</span>
                </div>
              )}
              {currentPw !== null && showCurrentPw && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-xs font-semibold text-slate-500">현재 등록된 비밀번호</span>
                  <div className="text-base font-mono font-bold text-slate-900 tracking-wider">
                    {currentPw}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="block text-xs font-bold text-slate-700">
                  새 비밀번호 (한글 허용)
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type="text"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setErrorMessage(""); }}
                    placeholder="새 비밀번호 입력"
                    autoComplete="off"
                    spellCheck={false}
                    style={{ WebkitTextSecurity: showNewPw ? 'none' : 'disc' } as React.CSSProperties}
                    className="w-full h-11 px-4 pr-11 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-700">
                  새 비밀번호 확인
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type="text"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setErrorMessage(""); }}
                    placeholder="새 비밀번호 재입력"
                    autoComplete="off"
                    spellCheck={false}
                    style={{ WebkitTextSecurity: showConfirmPw ? 'none' : 'disc' } as React.CSSProperties}
                    className="w-full h-11 px-4 pr-11 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirmPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={isChanging}
                  className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-sm shadow-sm transition-all disabled:opacity-50"
                >
                  {isChanging ? "변경 중..." : "비밀번호 변경 완료"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setNewPassword("");
                    setConfirmPassword("");
                    setErrorMessage("");
                  }}
                  className="px-4 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-all"
                >
                  취소
                </button>
              </div>
            </form>
          )}

          {message && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
