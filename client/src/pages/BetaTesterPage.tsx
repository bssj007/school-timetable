import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RotateCcw, Undo2, Award, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { getPumasiCookie, clearPumasiCookie, PumasiStatus } from '@/lib/pumasiCookie';

interface BetaTesterPageProps {
  onBack: () => void;
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

export default function BetaTesterPage({ onBack }: BetaTesterPageProps) {
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
  }, []);

  const handleBack = () => {
    if (window.confirm('품앗이 모드를 종료하고 시간표 페이지로 이동하시겠습니까?\n(언제든 다시 품앗이 모드로 진입할 수 있습니다)')) {
      clearPumasiCookie();
      onBack();
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
  const progressPercent = Math.min(100, Math.round((pumasi.daysPassed / 14) * 100));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans select-none pb-12">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors active:scale-95"
            title="원래 시간표 페이지로 돌아가기"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>시간표로 돌아가기</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              <Sparkles className="w-3 h-3 text-amber-500" />
              품앗이 모드
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-5 flex flex-col gap-4">
        
        {/* Android Closed Testing Status Banner */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm transition-all">
          <div className="flex items-start justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${pumasi.isComplete ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                {pumasi.isComplete ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  Android 비공개 테스터 참여 현황
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Google Play 비공개 테스트 (14일 연속 참여 기준)
                </p>
              </div>
            </div>

            <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${pumasi.isComplete ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
              {pumasi.isComplete ? '14일 달성 완료' : `${pumasi.daysPassed}일차 / 14일`}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden my-3 border border-slate-200/50">
            <div
              className={`h-full transition-all duration-500 rounded-full ${pumasi.isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Status Message */}
          {pumasi.isComplete ? (
            <div className="bg-emerald-50/80 border border-emerald-200/70 rounded-xl p-3 text-xs text-emerald-800 flex items-start gap-2">
              <Award className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">🎉 비공개 테스트 최소 기준(14일)이 모두 충족되었습니다!</strong>
                <p className="mt-0.5 text-emerald-700/90 leading-relaxed">
                  성실하게 테스트에 참여해 주셔서 진심으로 감사드립니다. 이제 앱을 안전하게 제거하셔도 좋으며, 시간표 기능으로 언제든 돌아가실 수 있습니다.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-start gap-2">
              <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span>
                  테스트 완료까지 <strong className="font-semibold text-slate-800">{pumasi.daysRemaining}일</strong> 남았습니다.
                </span>
                <p className="mt-0.5 text-slate-500 leading-relaxed">
                  비공개 테스트 요건 충족을 위해 앱을 설치 유지해 주시고, 틈틈이 오목 게임을 한 판씩 즐겨주시면 큰 힘이 됩니다!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Gomoku Game Container */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm flex flex-col items-center">
          {/* Game Header / Controls */}
          <div className="w-full flex items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <span>원클릭 AI 오목</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {winner === 1 && <span className="text-emerald-600 font-bold">🎉 축하합니다! 흑돌(플레이어) 승리!</span>}
                {winner === 2 && <span className="text-rose-600 font-bold">🤖 AI(백돌)의 승리입니다!</span>}
                {winner === 'draw' && <span className="text-slate-600 font-bold">무승부입니다!</span>}
                {winner === 0 && (
                  isAiThinking ? (
                    <span className="text-blue-600 font-medium animate-pulse">AI가 최선의 수를 생각하고 있습니다...</span>
                  ) : (
                    <span>당신의 차례입니다 (흑돌 선공)</span>
                  )
                )}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleUndo}
                disabled={history.length < 2 || isAiThinking || winner !== 0}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none rounded-lg transition-colors active:scale-95"
                title="한 수 무르기"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>무르기</span>
              </button>

              <button
                onClick={handleReset}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors active:scale-95 shadow-sm"
                title="새 게임 시작"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>다시하기</span>
              </button>
            </div>
          </div>

          {/* Board Wrapper */}
          <div className="w-full flex justify-center py-1">
            <div
              className="relative w-full max-w-[400px] aspect-square bg-[#f4e4ba] rounded-lg shadow-md border-2 border-[#bfa068] p-2 select-none touch-manipulation"
              style={{
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.08), 0 4px 14px rgba(0,0,0,0.12)'
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
                        r="1.8"
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

                          {/* Placed Stone */}
                          {cell === 1 && (
                            <div
                              className={`relative w-[84%] h-[84%] rounded-full shadow-md transition-all ${
                                isWinningStone ? 'ring-2 ring-emerald-500 scale-105' : ''
                              }`}
                              style={{
                                background: 'radial-gradient(circle at 35% 35%, #555 0%, #111 60%, #000 100%)',
                                boxShadow: '1px 2px 4px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.3)',
                              }}
                            >
                              {isLast && (
                                <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-red-500 ring-2 ring-white/80" />
                              )}
                            </div>
                          )}

                          {cell === 2 && (
                            <div
                              className={`relative w-[84%] h-[84%] rounded-full shadow-md transition-all border border-slate-300 ${
                                isWinningStone ? 'ring-2 ring-rose-500 scale-105' : ''
                              }`}
                              style={{
                                background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #f0f0f0 50%, #d6d6d6 100%)',
                                boxShadow: '1px 2px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.9)',
                              }}
                            >
                              {isLast && (
                                <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white/80" />
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-3 text-center text-xs text-slate-400">
            교차점을 터치하여 돌을 놓으세요. 5개의 돌을 먼저 연속으로 놓는 쪽이 승리합니다.
          </div>
        </div>

      </main>
    </div>
  );
}
