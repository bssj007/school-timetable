import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { getTeacherNameCookie } from "@/components/RoleSelectDialog";
import { useUserConfig } from "@/contexts/UserConfigContext";

export default function TeacherAccount() {
  const [, setLocation] = useLocation();
  const { teacherName: ctxTeacherName } = useUserConfig();

  const [teacherName, setTeacherName] = useState<string>(() => {
    return ctxTeacherName || getTeacherNameCookie() || "";
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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

  useEffect(() => {
    if (!teacherName) {
      const storedId = localStorage.getItem("teacher-page-selected-teacher");
      if (storedId) {
        fetch("/api/comcigan?type=teacher_timetable")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.teachers && data.teachers[parseInt(storedId, 10)]) {
              const name = data.teachers[parseInt(storedId, 10)].replace(/\*$/, "");
              setTeacherName(name);
            }
          })
          .catch(() => {});
      }
    }
  }, [teacherName]);

  const handleBack = () => {
    setLocation("/teacher");
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

    if (newPassword !== confirmPassword) {
      setErrorMessage("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      return;
    }

    const confirmed = window.confirm(`"${teacherName}" 선생님의 비밀번호를 변경하시겠습니까?`);
    if (!confirmed) {
      return;
    }

    setIsChanging(true);
    try {
      const res = await fetch("/api/teacher-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teacherName,
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "비밀번호 변경 실패");
      }

      setMessage(data.message || "비밀번호가 성공적으로 변경되었습니다.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      alert("비밀번호가 성공적으로 변경되었습니다.");
    } catch (err: any) {
      setErrorMessage(err.message || "오류가 발생했습니다.");
      alert(err.message || "오류가 발생했습니다.");
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div style={{ backgroundColor: "#ffffff", minHeight: "100vh", padding: "20px", color: "#000000", fontFamily: "sans-serif" }}>
      <div>
        <button type="button" onClick={handleBack}>
          돌아가기
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <div>
        <p>
          <strong>계정명: </strong>
          <span>{teacherName ? `${teacherName} 선생님` : "선생님 (미선택)"}</span>
        </p>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <form onSubmit={handleChangePassword}>
        <div>
          <label htmlFor="current-password">현재 비밀번호: </label>
          <input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="현재 비밀번호 (기본: 관리)"
          />
        </div>
        <br />
        <div>
          <label htmlFor="new-password">새 비밀번호: </label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="새 비밀번호"
          />
        </div>
        <br />
        <div>
          <label htmlFor="confirm-password">새 비밀번호 확인: </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="새 비밀번호 확인"
          />
        </div>
        <br />
        <button type="submit" disabled={isChanging}>
          {isChanging ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>

      {message && (
        <div>
          <br />
          <p style={{ color: "green" }}>{message}</p>
        </div>
      )}

      {errorMessage && (
        <div>
          <br />
          <p style={{ color: "red" }}>{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
