import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RotateCcw, Undo2 } from 'lucide-react';
import { getPumasiCookie, clearPumasiCookie, PumasiStatus } from '@/lib/pumasiCookie';
import { useUserConfig } from '@/contexts/UserConfigContext';

interface BetaTesterPageProps {
  onBack?: () => void;
  hideBack?: boolean;
}

const BOARD_SIZE = 15;
// 0: empty, 1: black (Player), 2: white (AI)
type Player = 1 | 2;
type CellValue = 0 | Player;
type Board = CellValue[][];

interface Move {
  r: number;
  c: number;
  player: Player;
}

const STAR_POINTS = [
  { r: 3, c: 3 },
  { r: 3, c: 11 },
  { r: 7, c: 7 },
  { r: 11, c: 3 },
  { r: 11, c: 11 },
];

export default function BetaTesterPage({ onBack, hideBack }: BetaTesterPageProps) {
  const { publicSettings } = useUserConfig();
  const shouldHideBack = hideBack ?? Boolean(publicSettings?.is_force_beta_tester);
  const [pumasi, setPumasi] = useState<PumasiStatus>(() => getPumasiCookie());
  const [board, setBoard] = useState<Board>(() =>
    Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0))
  );
  const [history, setHistory] = useState<Move[]>([]);
  const [winner, setWinner] = useState<CellValue | 'draw'>(0);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [winningLine, setWinningLine] = useState<{ r: number; c: number }[]>([]);

  useEffect(() => {
    setPumasi(getPumasiCookie());
    const interval = setInterval(() => {
      setPumasi(getPumasiCookie());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleBack = () => {
    if (shouldHideBack) return;
    if (window.confirm('품앗이 모드를 종료하고 시간표 페이지로 이동하시겠습니까?')) {
      clearPumasiCookie();
      onBack?.();
    }
  };

  // Check victory in 4 directions
  const checkWin = useCallback((b: Board, r: number, c: number, p: Player): { isWin: boolean; line: { r: number; c: number }[] } => {
    const directions = [
      [ [0, 1], [0, -1] ],   // 가로
      [ [1, 0], [-1, 0] ],   // 세로
      [ [1, 1], [-1, -1] ],  // 대각선 \
      [ [1, -1], [-1, 1] ],  // 대각선 /
    ];

    for (const [d1, d2] of directions) {
      let count = 1;
      const line = [{ r, c }];

      for (const [dr, dc] of [d1, d2]) {
        let nr = r + dr;
        let nc = c + dc;
        while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && b[nr][nc] === p) {
          count++;
          line.push({ r: nr, c: nc });
          nr += dr;
          nc += dc;
        }
      }

      if (count >= 5) {
        return { isWin: true, line };
      }
    }

    return { isWin: false, line: [] };
  }, []);

  // AI heuristic evaluation
  const evaluateBoardPosition = useCallback((b: Board, r: number, c: number, targetPlayer: Player): number => {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1]
    ];

    let totalScore = 0;

    for (const [dr, dc] of directions) {
      // Analyze consecutive stones and open ends
      let myStones = 0;
      let openEnds = 0;

      // Positive direction
      let step = 1;
      while (step <= 4) {
        const nr = r + dr * step;
        const nc = c + dc * step;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
          break;
        }
        if (b[nr][nc] === targetPlayer) {
          myStones++;
        } else if (b[nr][nc] === 0) {
          openEnds++;
          break;
        } else {
          break;
        }
        step++;
      }

      // Negative direction
      step = 1;
      while (step <= 4) {
        const nr = r - dr * step;
        const nc = c - dc * step;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
          break;
        }
        if (b[nr][nc] === targetPlayer) {
          myStones++;
        } else if (b[nr][nc] === 0) {
          openEnds++;
          break;
        } else {
          break;
        }
        step++;
      }

      // Scoring
      if (myStones >= 4) {
        totalScore += 100000; // 5-in-a-row
      } else if (myStones === 3) {
        if (openEnds === 2) totalScore += 10000; // Open 4
        else if (openEnds === 1) totalScore += 2500; // Half-open 4
      } else if (myStones === 2) {
        if (openEnds === 2) totalScore += 1200; // Open 3
        else if (openEnds === 1) totalScore += 200; // Half-open 3
      } else if (myStones === 1) {
        if (openEnds === 2) totalScore += 80; // Open 2
        else if (openEnds === 1) totalScore += 15;
      }
    }

    return totalScore;
  }, []);

  // AI calculates best move
  const getBestAiMove = useCallback((currentBoard: Board): { r: number; c: number } => {
    let maxScore = -1;
    let bestMoves: { r: number; c: number }[] = [];

    // Check if board is empty
    let emptyCount = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (currentBoard[r][c] === 0) emptyCount++;
      }
    }

    // First move: center or near center
    if (emptyCount === BOARD_SIZE * BOARD_SIZE) {
      return { r: 7, c: 7 };
    }
    if (emptyCount === BOARD_SIZE * BOARD_SIZE - 1) {
      if (currentBoard[7][7] === 0) return { r: 7, c: 7 };
      return { r: 7, c: 8 };
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (currentBoard[r][c] !== 0) continue;

        // Check if there are neighboring stones within distance 2
        let hasNeighbor = false;
        for (let dr = -2; dr <= 2 && !hasNeighbor; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && currentBoard[nr][nc] !== 0) {
              hasNeighbor = true;
              break;
            }
          }
        }
        if (!hasNeighbor) continue;

        // AI Attack score (player 2)
        const attackScore = evaluateBoardPosition(currentBoard, r, c, 2);
        // AI Defense score (block player 1)
        const defenseScore = evaluateBoardPosition(currentBoard, r, c, 1);

        // Weighted total: defense is very urgent for player's 4 and 3
        let combined = attackScore * 1.2 + defenseScore;

        // Immediate win priority
        if (attackScore >= 100000) combined = 2000000;
        else if (defenseScore >= 100000) combined = 1000000;
        else if (defenseScore >= 10000) combined = 500000;
        else if (attackScore >= 10000) combined = 400000;

        // Center proximity bonus
        const centerBonus = (7 - Math.abs(r - 7)) + (7 - Math.abs(c - 7));
        combined += centerBonus;

        if (combined > maxScore) {
          maxScore = combined;
          bestMoves = [{ r, c }];
        } else if (combined === maxScore) {
          bestMoves.push({ r, c });
        }
      }
    }

    if (bestMoves.length === 0) {
      return { r: 7, c: 7 };
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }, [evaluateBoardPosition]);

  // Handle player click
  const handleCellClick = (r: number, c: number) => {
    if (board[r][c] !== 0 || winner !== 0 || isAiThinking) return;

    // Player move (Black: 1)
    const newBoard = board.map(row => [...row]);
    newBoard[r][c] = 1;
    const playerMove: Move = { r, c, player: 1 };
    const nextHistory = [...history, playerMove];

    setBoard(newBoard);
    setHistory(nextHistory);

    const winCheck = checkWin(newBoard, r, c, 1);
    if (winCheck.isWin) {
      setWinner(1);
      setWinningLine(winCheck.line);
      return;
    }

    // Check draw
    if (nextHistory.length === BOARD_SIZE * BOARD_SIZE) {
      setWinner('draw');
      return;
    }

    // AI Turn (White: 2)
    setIsAiThinking(true);
    setTimeout(() => {
      const aiMove = getBestAiMove(newBoard);
      const aiBoard = newBoard.map(row => [...row]);
      aiBoard[aiMove.r][aiMove.c] = 2;
      const aiHistoryMove: Move = { r: aiMove.r, c: aiMove.c, player: 2 };

      setBoard(aiBoard);
      setHistory([...nextHistory, aiHistoryMove]);
      setIsAiThinking(false);

      const aiWinCheck = checkWin(aiBoard, aiMove.r, aiMove.c, 2);
      if (aiWinCheck.isWin) {
        setWinner(2);
        setWinningLine(aiWinCheck.line);
      } else if (nextHistory.length + 1 === BOARD_SIZE * BOARD_SIZE) {
        setWinner('draw');
      }
    }, 280);
  };

  // Reset game
  const handleReset = () => {
    setBoard(Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0)));
    setHistory([]);
    setWinner(0);
    setWinningLine([]);
    setIsAiThinking(false);
  };

  // Undo (revert 2 moves: AI + Player)
  const handleUndo = () => {
    if (history.length < 2 || isAiThinking) return;

    const newHistory = history.slice(0, -2);
    const newBoard = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0));
    for (const move of newHistory) {
      newBoard[move.r][move.c] = move.player;
    }

    setBoard(newBoard);
    setHistory(newHistory);
    setWinner(0);
    setWinningLine([]);
  };

  const lastMove = history[history.length - 1];

  const remainingTotalHours = Math.max(0, Math.floor(pumasi.remainingMs / (1000 * 60 * 60)));
  const remainingDays = Math.floor(remainingTotalHours / 24);
  const remainingHours = remainingTotalHours % 24;

  const elapsedTotalSec = Math.floor(pumasi.elapsedMs / 1000);
  const elapsedDays = Math.floor(elapsedTotalSec / 86400);
  const elapsedHours = Math.floor((elapsedTotalSec % 86400) / 3600);
  const elapsedMinutes = Math.floor((elapsedTotalSec % 3600) / 60);
  const elapsedSeconds = elapsedTotalSec % 60;

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans select-none pb-6">
      <style>{`
        @keyframes winShimmer {
          0% { transform: translateX(-150%); }
          100% { transform: translateX(350%); }
        }
        @keyframes stoneDrop {
          0% {
            transform: scale(1.35) translateY(-3px);
            opacity: 0.7;
          }
          65% {
            transform: scale(0.96) translateY(0);
            opacity: 1;
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      {/* Top Navigation Bar (강제 지정 시 조용히 뒤로가기 버튼 숨김) */}
      {!shouldHideBack && (
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-2">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors py-0.5"
              title="시간표로 돌아가기"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>시간표로 돌아가기</span>
            </button>
          </div>
        </header>
      )}

      {/* Main Content Area (No Card Containers, Compact Layout) */}
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-3 flex flex-col gap-4">
        
        {/* Testing Status Section */}
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              {pumasi.isComplete ? '14일 비공개 테스트 완료' : '14일 비공개 테스트'}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">
                {pumasi.isComplete ? '완료' : `남은 기간: ${remainingDays}일 ${remainingHours}시간`}
              </span>
              <span className="text-xs font-mono font-bold text-emerald-600">
                {pumasi.exactPercent.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Windows File Explorer Style Progress Bar */}
          <div className="w-full h-5 sm:h-6 bg-[#e6e6e6] border border-[#bcbcbc] rounded-[3px] p-[1.5px] overflow-hidden shadow-inner relative">
            <div
              className="h-full rounded-[2px] transition-all duration-300 relative overflow-hidden"
              style={{
                width: `${Math.min(100, pumasi.exactPercent)}%`,
                background: 'linear-gradient(180deg, #4ade80 0%, #22c55e 35%, #16a34a 70%, #15803d 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.15)',
              }}
            >
              <div
                className="absolute inset-0 opacity-40 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0) 100%)',
                  animation: 'winShimmer 2.2s infinite linear',
                  width: '40%',
                }}
              />
            </div>
          </div>

          {/* ── 디지털 빨간색 시계 (검은 배경): 실시간 일, 시간, 분, 초 경과 ── */}
          <div className="bg-black text-red-500 rounded-xl p-3 border border-neutral-800 shadow-[inset_0_2px_8px_rgba(0,0,0,0.9),0_4px_12px_rgba(0,0,0,0.2)] flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono border-b border-neutral-900 pb-1 px-1 text-neutral-400">
              <span className="flex items-center gap-1.5 font-semibold text-red-500">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
                <span>실시간 참여 경과</span>
              </span>
              <span className="text-[10px] text-neutral-500">
                시작: {pumasi.startDateText}
              </span>
            </div>

            <div className="flex items-center justify-center gap-1 sm:gap-1.5 py-1 font-mono select-none">
              {/* 일 */}
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl sm:text-3xl font-black tracking-wider text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.85)]">
                  {String(elapsedDays).padStart(2, '0')}
                </span>
                <span className="text-[11px] font-bold text-red-400/80 mr-1.5">일</span>
              </div>

              {/* 구분자 */}
              <span className="text-xl sm:text-2xl font-bold text-red-600/70 pb-1">:</span>

              {/* 시간 */}
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl sm:text-3xl font-black tracking-wider text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.85)]">
                  {String(elapsedHours).padStart(2, '0')}
                </span>
                <span className="text-[11px] font-bold text-red-400/80 mr-1.5">시간</span>
              </div>

              {/* 구분자 */}
              <span className="text-xl sm:text-2xl font-bold text-red-600/70 pb-1">:</span>

              {/* 분 */}
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl sm:text-3xl font-black tracking-wider text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.85)]">
                  {String(elapsedMinutes).padStart(2, '0')}
                </span>
                <span className="text-[11px] font-bold text-red-400/80 mr-1.5">분</span>
              </div>

              {/* 구분자 */}
              <span className="text-xl sm:text-2xl font-bold text-red-600/70 pb-1">:</span>

              {/* 초 */}
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl sm:text-3xl font-black tracking-wider text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.85)]">
                  {String(elapsedSeconds).padStart(2, '0')}
                </span>
                <span className="text-[11px] font-bold text-red-400/80">초</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono px-1 pt-0.5 border-t border-neutral-900/80">
              <span>진행률: <strong className="text-emerald-400">{pumasi.exactPercent.toFixed(2)}%</strong></span>
              <span>{pumasi.isComplete ? <strong className="text-emerald-400">14일 달성 완료</strong> : `남은 기간: ${pumasi.remainingText}`}</span>
            </div>
          </div>

          {/* Simplified Description */}
          <p className="text-[11px] text-slate-400">
            {pumasi.isComplete
              ? '14일 기준이 충족되었습니다. 이제 앱을 삭제하셔도 좋습니다.'
              : '14일 기준 충족 시 앱을 삭제하셔도 좋습니다.'}
          </p>
        </section>

        {/* Gomoku Game Section */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 pb-0.5">
            <div>
              <h3
                className="text-xl font-bold text-slate-900 tracking-wider"
                style={{ fontFamily: "'Gungsuh', 'GungsuhChe', 'Batang', serif" }}
              >
                오목
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {winner === 1 && <span className="text-emerald-600 font-bold">플레이어 승리!</span>}
                {winner === 2 && <span className="text-rose-600 font-bold">AI 승리</span>}
                {winner === 'draw' && <span className="text-slate-600 font-bold">무승부</span>}
                {winner === 0 && (
                  isAiThinking ? (
                    <span className="text-blue-600 animate-pulse font-medium">AI 착수 중...</span>
                  ) : (
                    <span>흑돌(선공) 차례</span>
                  )
                )}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleUndo}
                disabled={history.length < 2 || isAiThinking || winner !== 0}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none rounded transition-colors"
                title="한 수 무르기"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>무르기</span>
              </button>

              <button
                onClick={handleReset}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors shadow-sm"
                title="새 게임 시작"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>다시하기</span>
              </button>
            </div>
          </div>

          {/* Board Wrapper (Reduced size for optimal screen fit and convenience) */}
          <div className="w-full flex justify-center py-0.5">
            <div
              className="relative w-[86vw] max-w-[310px] aspect-square bg-[#f4e4ba] rounded-lg shadow-sm border border-[#bfa068] p-1.5 select-none touch-manipulation"
              style={{
                boxShadow: 'inset 0 0 6px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.08)'
              }}
            >
              {/* Grid Lines (15x15) */}
              <div className="relative w-full h-full">
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 140 140">
                  {/* Grid Lines */}
                  {Array.from({ length: 15 }).map((_, i) => {
                    const coord = 5 + i * 9.2857;
                    return (
                      <React.Fragment key={i}>
                        {/* Horizontal Line */}
                        <line
                          x1="5"
                          y1={coord}
                          x2="135"
                          y2={coord}
                          stroke="#7c5e2d"
                          strokeWidth="0.8"
                          strokeOpacity="0.85"
                        />
                        {/* Vertical Line */}
                        <line
                          x1={coord}
                          y1="5"
                          x2={coord}
                          y2="135"
                          stroke="#7c5e2d"
                          strokeWidth="0.8"
                          strokeOpacity="0.85"
                        />
                      </React.Fragment>
                    );
                  })}

                  {/* Star Points */}
                  {STAR_POINTS.map((pt, idx) => {
                    const cx = 5 + pt.c * 9.2857;
                    const cy = 5 + pt.r * 9.2857;
                    return (
                      <circle
                        key={idx}
                        cx={cx}
                        cy={cy}
                        r="1.6"
                        fill="#593e15"
                      />
                    );
                  })}
                </svg>

                {/* Clickable Intersections and Stones */}
                <div
                  className="absolute inset-0 grid"
                  style={{
                    gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
                    gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
                  }}
                >
                  {board.map((row, r) =>
                    row.map((cell, c) => {
                      const isLast = lastMove && lastMove.r === r && lastMove.c === c;
                      const isWinningStone = winningLine.some(pt => pt.r === r && pt.c === c);

                      return (
                        <button
                          key={`${r}-${c}`}
                          onClick={() => handleCellClick(r, c)}
                          disabled={cell !== 0 || isAiThinking || winner !== 0}
                          className="relative flex items-center justify-center p-0.5 focus:outline-none transition-transform active:scale-95 group"
                          aria-label={`좌표 ${r + 1}, ${c + 1}`}
                        >
                          {/* Ghost stone on hover */}
                          {cell === 0 && !isAiThinking && winner === 0 && (
                            <div className="w-[78%] h-[78%] rounded-full bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                          )}

                          {/* Placed Stone (Player: Black) */}
                          {cell === 1 && (
                            <div
                              className={`relative w-[86%] h-[86%] rounded-full shadow-md transition-all ${
                                isWinningStone ? 'ring-2 ring-emerald-500 scale-105' : ''
                              }`}
                              style={{
                                background: 'radial-gradient(circle at 35% 35%, #555 0%, #111 60%, #000 100%)',
                                boxShadow: '1px 2px 3px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.3)',
                                animation: isLast ? 'stoneDrop 0.22s cubic-bezier(0.2, 0.8, 0.3, 1) forwards' : undefined,
                              }}
                            />
                          )}

                          {/* Placed Stone (AI: White) - No dot, drop animation */}
                          {cell === 2 && (
                            <div
                              className={`relative w-[86%] h-[86%] rounded-full shadow-md transition-all border border-slate-300 ${
                                isWinningStone ? 'ring-2 ring-rose-500 scale-105' : ''
                              }`}
                              style={{
                                background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #f0f0f0 50%, #d6d6d6 100%)',
                                boxShadow: '1px 2px 3px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.9)',
                                animation: isLast ? 'stoneDrop 0.22s cubic-bezier(0.2, 0.8, 0.3, 1) forwards' : undefined,
                              }}
                            />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
