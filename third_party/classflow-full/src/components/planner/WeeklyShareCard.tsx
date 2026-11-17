import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Clipboard, Share2, Trash2, Trophy, Upload } from "lucide-react";
import type { Period, Session } from "../../types";
import { formatDuration } from "../../lib/date";
import { sessionMinutes } from "../../lib/schedule";
import type { PlannerTask, StudyLog } from "../../lib/stats";
import { studyMinutes } from "../../lib/stats";
import {
  decodeShare,
  encodeShare,
  loadNickname,
  loadShares,
  rankShares,
  saveNickname,
  saveShares,
  shareScore,
  shareToText,
  type WeeklyShare,
} from "../../lib/share";

interface WeeklyShareCardProps {
  now: Date;
  week: number;
  term: string;
  weekDates: Date[];
  sessions: Session[];
  periods: Period[];
  tasks: PlannerTask[];
  logs: StudyLog[];
}

export function WeeklyShareCard({
  now,
  week,
  term,
  weekDates,
  sessions,
  periods,
  tasks,
  logs,
}: WeeklyShareCardProps) {
  const [nickname, setNickname] = useState(() => loadNickname());
  const [peers, setPeers] = useState<WeeklyShare[]>(() => loadShares());
  const [ownShare, setOwnShare] = useState<WeeklyShare | null>(null);
  const [code, setCode] = useState("");
  const [importText, setImportText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const start = weekDates[0]
    ? new Date(weekDates[0].getFullYear(), weekDates[0].getMonth(), weekDates[0].getDate())
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = weekDates[weekDates.length - 1]
    ? new Date(
        weekDates[weekDates.length - 1].getFullYear(),
        weekDates[weekDates.length - 1].getMonth(),
        weekDates[weekDates.length - 1].getDate(),
        23,
        59,
        59,
      )
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const classMinutes = sessions.reduce((total, session) => total + sessionMinutes(periods, session), 0);
  const weekStudyMinutes = studyMinutes(logs, start, end);
  const courseCount = new Set(sessions.map((session) => session.course.id)).size;
  const tasksDone = tasks.filter((task) => {
    if (!task.done || !task.completedAt) return false;
    const completed = new Date(task.completedAt);
    return !Number.isNaN(completed.getTime()) && completed >= start && completed <= end;
  }).length;

  const ranking = useMemo(
    () => rankShares(ownShare ? [ownShare, ...peers] : peers),
    [ownShare, peers],
  );

  const buildShare = (): WeeklyShare => ({
    id: `share-${Date.now().toString(36)}`,
    name: nickname.trim() || "同学",
    week,
    term,
    courseCount,
    classMinutes,
    studyMinutes: weekStudyMinutes,
    tasksDone,
    createdAt: new Date().toISOString(),
  });

  const generate = () => {
    const share = buildShare();
    setOwnShare(share);
    setCode(encodeShare(share));
    setNotice("周报已生成，复制口令发给同学即可对比。");
  };

  const copyReport = () => {
    const share = ownShare ?? buildShare();
    copyText(shareToText(share, code || encodeShare(share)), "周报文案已复制。");
  };

  const copyText = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      setNotice("复制失败，请手动选中文案复制。");
    }
  };

  const importPeer = (event: FormEvent) => {
    event.preventDefault();
    const peer = decodeShare(importText);
    if (!peer) {
      setNotice("口令无法识别，确认粘贴的是完整的课序PLUS周报口令。");
      return;
    }
    const key = `${peer.name}|${peer.week}|${peer.createdAt}`;
    const next = [peer, ...peers.filter((item) => `${item.name}|${item.week}|${item.createdAt}` !== key)].slice(0, 30);
    setPeers(next);
    saveShares(next);
    setImportText("");
    setNotice(`已导入 ${peer.name} 的第 ${peer.week} 周周报。`);
  };

  const removePeer = (id: string) => {
    const next = peers.filter((item) => item.id !== id);
    setPeers(next);
    saveShares(next);
  };

  const updateNickname = (value: string) => {
    setNickname(value);
    saveNickname(value);
  };

  return (
    <section className="study-card share-card">
      <header className="study-card-head">
        <div>
          <p className="eyebrow">SHARE</p>
          <h2>周报与群排行</h2>
        </div>
        <span className="study-card-tag">第 {week} 周</span>
      </header>

      {notice ? (
        <div className="share-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="关闭提示">
            ×
          </button>
        </div>
      ) : null}

      <div className="share-columns">
        <div className="share-mine">
          <label className="share-nickname">
            <span>昵称</span>
            <input
              value={nickname}
              onChange={(event) => updateNickname(event.target.value)}
              placeholder="给自己起个名字"
              maxLength={20}
              aria-label="分享昵称"
            />
          </label>

          <div className="share-stats">
            <div>
              <strong>{courseCount}</strong>
              <span>门课程</span>
            </div>
            <div>
              <strong>{formatDuration(classMinutes)}</strong>
              <span>本周课时</span>
            </div>
            <div>
              <strong>{formatDuration(weekStudyMinutes)}</strong>
              <span>本周自习</span>
            </div>
            <div>
              <strong>{tasksDone}</strong>
              <span>完成待办</span>
            </div>
          </div>

          <div className="share-actions">
            <button className="primary-button" type="button" onClick={generate}>
              <Share2 size={14} />
              生成周报
            </button>
            <button
              className="small-button"
              type="button"
              onClick={copyReport}
            >
              <Clipboard size={13} />
              复制文案
            </button>
          </div>

          {code ? (
            <textarea className="share-code" readOnly value={code} rows={3} aria-label="周报口令" />
          ) : (
            <p className="study-empty-text">生成口令后发给同学，对方导入就能加入排行。</p>
          )}

          <form className="share-import" onSubmit={importPeer}>
            <input
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="粘贴同学的 KEXUSHARE1: 口令"
              aria-label="导入周报口令"
            />
            <button className="small-button" type="submit" disabled={!importText.trim()}>
              <Upload size={13} />
              导入
            </button>
          </form>
        </div>

        <div className="share-rank">
          <div className="share-rank-head">
            <Trophy size={14} />
            <span>专注分排行</span>
            <small>{ranking.length} 人</small>
          </div>
          {ranking.length === 0 ? (
            <p className="study-empty">还没有排行。生成自己的周报，或导入同学的口令。</p>
          ) : (
            <ol className="share-rank-list">
              {ranking.map((item, index) => {
                const mine = item.id === ownShare?.id;
                return (
                  <li key={item.id} className={mine ? "is-me" : ""}>
                    <button
                      className="share-rank-open"
                      type="button"
                      onClick={() => setDetailId(detailId === item.id ? null : item.id)}
                      aria-expanded={detailId === item.id}
                      aria-label={`查看 ${item.name} 的第 ${item.week} 周周报`}
                    >
                      <span className="share-rank-index">{index + 1}</span>
                      <div className="share-rank-copy">
                        <strong>
                          {item.name}
                          {mine ? <em>我</em> : null}
                        </strong>
                        <span>
                          第 {item.week} 周 · 自习 {formatDuration(item.studyMinutes)} · 待办 {item.tasksDone}
                        </span>
                      </div>
                      <span className="share-rank-score">{shareScore(item)}</span>
                    </button>
                    {mine ? null : (
                      <button
                        className="task-delete"
                        type="button"
                        onClick={() => removePeer(item.id)}
                        aria-label={`删除 ${item.name} 的周报`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    {detailId === item.id ? (
                      <div className="share-detail">
                        <div>
                          <span>学期</span>
                          <strong>{item.term || "未填写"}</strong>
                        </div>
                        <div>
                          <span>课时</span>
                          <strong>{formatDuration(item.classMinutes)}</strong>
                        </div>
                        <div>
                          <span>自习</span>
                          <strong>{formatDuration(item.studyMinutes)}</strong>
                        </div>
                        <div>
                          <span>完成待办</span>
                          <strong>{item.tasksDone} 项</strong>
                        </div>
                        <div>
                          <span>课程数</span>
                          <strong>{item.courseCount} 门</strong>
                        </div>
                        <div>
                          <span>专注分</span>
                          <strong>{shareScore(item)}</strong>
                        </div>
                        <p>
                          第 {item.week} 周周报 · 生成于{" "}
                          {new Date(item.createdAt).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
