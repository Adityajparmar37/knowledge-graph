import { useCallback, useMemo, useState } from 'react';
import { StandardSearchField, StandardPicker } from './components/StandardSelector.jsx';
import StudentSelector from './components/StudentSelector.jsx';
import StandardGraph from './components/StandardGraph.jsx';
import SubjectSkillGraph from './components/SubjectSkillGraph.jsx';
import NodeDetailPage from './components/NodeDetailPage.jsx';
import {
  getAllStandards,
  getAllSubjects,
  getAllSkills,
  getStandard,
  getSubject,
  gradeLabel,
} from './lib/graphStore.js';
import { getSkillOwner } from './lib/traverse.js';

export default function App() {
  const [selectedStandardId, setSelectedStandardId] = useState(null);
  const [stateFilter, setStateFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');

  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [selectedSubjectName, setSelectedSubjectName] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [focusSubjectId, setFocusSubjectId] = useState(null);
  const [focusSkillId, setFocusSkillId] = useState(null);
  // Mirrors of each graph's "last tapped" node, so the "View full details"
  // action can live in the panel heading instead of inside the canvas.
  const [standardPanelSelection, setStandardPanelSelection] = useState(null);
  const [subjectPanelSelection, setSubjectPanelSelection] = useState(null);

  // "explorer" is the existing 3-panel click-to-expand view; "nodeDetail" is
  // the standalone "everything about this node" page. detailNode is only
  // meaningful while activeView === "nodeDetail".
  const [activeView, setActiveView] = useState('explorer');
  const [detailNode, setDetailNode] = useState(null); // { kind: "standard"|"subject"|"skill", id: string }

  const states = useMemo(
    () => [...new Set(getAllStandards().map((standard) => standard.jurisdiction))].sort(),
    []
  );

  const grades = useMemo(
    () => [...new Set(getAllStandards().map((standard) => standard.grade))].sort((a, b) => a - b),
    []
  );

  const dataCounts = useMemo(() => {
    const allSkills = getAllSkills();
    const subSkillIds = new Set(allSkills.flatMap((skill) => skill.subSkillIds || []));
    return {
      standards: getAllStandards().length,
      subjects: getAllSubjects().length,
      skills: allSkills.filter((skill) => !subSkillIds.has(skill.id)).length,
      subSkills: allSkills.filter((skill) => subSkillIds.has(skill.id)).length,
    };
  }, []);

  const handleStateFilterChange = useCallback((nextState) => {
    setStateFilter(nextState);
    setSelectedStandardId(null);
    setSelectedSubjectId(null);
    setSelectedSubjectName(null);
    setFocusSubjectId(null);
    setFocusSkillId(null);
  }, []);

  const handleGradeFilterChange = useCallback((nextGrade) => {
    setGradeFilter(nextGrade);
    setSelectedStandardId(null);
    setSelectedSubjectId(null);
    setSelectedSubjectName(null);
    setFocusSubjectId(null);
    setFocusSkillId(null);
  }, []);

  const handleSelectStandard = useCallback((standardId) => {
    setSelectedStandardId(standardId);
    setSelectedSubjectId(null);
    setSelectedSubjectName(null);
    setFocusSubjectId(null);
    setFocusSkillId(null);
  }, []);

  const handleSelectSubject = useCallback((subjectId, subjectName) => {
    setSelectedSubjectId(subjectId);
    setSelectedSubjectName(subjectName);
    setFocusSkillId(null);
  }, []);

  const handleSelectStudent = useCallback((studentId) => {
    setSelectedStudentId(studentId);
  }, []);

  // Jumps the whole explorer to wherever a cross-grade `linkedSkillId`
  // lives: reselects the owning standard + subject (so both graphs
  // re-render around it) and sets focusSkillId so the right panel
  // auto-selects/highlights that skill once mounted.
  const handleJumpToLinkedSkill = useCallback((skillId) => {
    const owner = getSkillOwner(skillId);
    if (!owner) return;
    const subject = getSubject(owner.subjectId);
    setSelectedStandardId(owner.standardId);
    setSelectedSubjectId(owner.subjectId);
    setSelectedSubjectName(subject ? subject.name : null);
    setFocusSubjectId(owner.subjectId);
    setFocusSkillId(skillId);
  }, []);

  // Opens the standalone Node Detail page for any node clicked anywhere in
  // the app (a Standard, a Subject, or a Skill/Sub-skill). Also used by the
  // detail page itself to keep navigating the graph via its chips.
  const handleOpenNodeDetail = useCallback((kind, id) => {
    setDetailNode({ kind, id });
    setActiveView('nodeDetail');
  }, []);

  const handleBackToExplorer = useCallback(() => {
    setActiveView('explorer');
  }, []);

  const selectedStandard = selectedStandardId ? getStandard(selectedStandardId) : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Standards &amp; Skills Explorer</h1>
        <p>
          Pick a standard, click through its breakdown, and drill into a subject's skills to see
          worked examples and pass criteria. Track a student to see live pass/fail status and
          auto-diagnostic drill-downs on failed skills.
        </p>

        <ul className="data-counts">
          <li>
            <strong>{dataCounts.standards}</strong> standards
          </li>
          <li>
            <strong>{dataCounts.subjects}</strong> subjects
          </li>
          <li>
            <strong>{dataCounts.skills}</strong> skills
          </li>
          <li>
            <strong>{dataCounts.subSkills}</strong> sub-skills
          </li>
        </ul>

        {activeView === 'explorer' && (
          <div className="app-header-controls">
            <StandardSearchField
              selectedId={selectedStandardId}
              onSelect={handleSelectStandard}
              state={stateFilter}
              grade={gradeFilter}
            />

            <div className="standard-state-field">
              <label className="field-label" htmlFor="standard-state">
                State
              </label>
              <select
                id="standard-state"
                className="standard-state-select"
                value={stateFilter}
                onChange={(evt) => handleStateFilterChange(evt.target.value)}
              >
                <option value="all">All states</option>
                {states.map((jurisdiction) => (
                  <option key={jurisdiction} value={jurisdiction}>
                    {jurisdiction}
                  </option>
                ))}
              </select>
            </div>

            <div className="standard-grade-field">
              <label className="field-label" htmlFor="standard-grade">
                Grade
              </label>
              <select
                id="standard-grade"
                className="standard-grade-select"
                value={gradeFilter}
                onChange={(evt) =>
                  handleGradeFilterChange(
                    evt.target.value === 'all' ? 'all' : Number(evt.target.value)
                  )
                }
              >
                <option value="all">All grades</option>
                {grades.map((grade) => (
                  <option key={grade} value={grade}>
                    {gradeLabel(grade)}
                  </option>
                ))}
              </select>
            </div>

            <StandardPicker
              selectedId={selectedStandardId}
              onSelect={handleSelectStandard}
              state={stateFilter}
              grade={gradeFilter}
            />

            <StudentSelector selectedId={selectedStudentId} onSelect={handleSelectStudent} />
          </div>
        )}

        {activeView === 'explorer' && selectedStandard && (
          <div className="standard-selected-summary">
            <div className="standard-selected-code">{selectedStandard.code}</div>
            <div className="standard-selected-desc">{selectedStandard.description}</div>
          </div>
        )}

        {activeView === 'explorer' && selectedStudentId && (
          <ul className="status-legend">
            <li>
              <span className="status-legend-swatch status-legend-pass" />
              Passed
            </li>
            <li>
              <span className="status-legend-swatch status-legend-fail" />
              Failed
            </li>
            <li>
              <span className="status-legend-swatch status-legend-improve" />
              Unattempted — room to improve
            </li>
          </ul>
        )}
      </header>

      {activeView === 'nodeDetail' && detailNode ? (
        <NodeDetailPage
          kind={detailNode.kind}
          id={detailNode.id}
          studentId={selectedStudentId}
          onNavigate={handleOpenNodeDetail}
          onBack={handleBackToExplorer}
        />
      ) : (
        <div className="panel-grid">
          <section className="panel panel-graph">
            <div className="panel-title-row">
              <h2 className="panel-title">Standard Breakdown</h2>
              {standardPanelSelection && (
                <button
                  type="button"
                  className="node-detail-view-btn"
                  onClick={() =>
                    handleOpenNodeDetail(standardPanelSelection.kind, standardPanelSelection.id)
                  }
                >
                  View full details →
                </button>
              )}
            </div>
            <StandardGraph
              standardId={selectedStandardId}
              studentId={selectedStudentId}
              focusSubjectId={focusSubjectId}
              onSelectSubject={handleSelectSubject}
              onAdvanceStandard={handleSelectStandard}
              onLastTappedChange={setStandardPanelSelection}
            />
          </section>

          <section className="panel panel-graph">
            <div className="panel-title-row">
              <h2 className="panel-title">
                Subject Detail{selectedSubjectName ? ` — ${selectedSubjectName}` : ''}
              </h2>
              {subjectPanelSelection && (
                <button
                  type="button"
                  className="node-detail-view-btn"
                  onClick={() =>
                    handleOpenNodeDetail(subjectPanelSelection.kind, subjectPanelSelection.id)
                  }
                >
                  View full details →
                </button>
              )}
            </div>
            <SubjectSkillGraph
              subjectId={selectedSubjectId}
              studentId={selectedStudentId}
              focusSkillId={focusSkillId}
              onJumpToLinkedSkill={handleJumpToLinkedSkill}
              onLastTappedChange={setSubjectPanelSelection}
            />
          </section>
        </div>
      )}
    </div>
  );
}
