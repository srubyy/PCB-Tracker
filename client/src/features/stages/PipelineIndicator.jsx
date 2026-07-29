import React from 'react';

const STEP_NAMES = [
  "Inward",
  "Segregation",
  "Programming",
  "1st Testing",
  "Debug",
  "Entry",
  "Cleaning",
  "QC After Cleaning",
  "Marking & Coating",
  "Final Testing",
  "Final Entry",
  "Packing"
];

const PipelineIndicator = ({ 
  selectedStep, 
  onSelectStep, 
  onViewStepPanels,
  hidePCBsButton,
  steps = []
}) => {
  const allSteps = steps.length > 0 
    ? steps.map(s => ({ step_no: s.step_no, name: s.name }))
    : STEP_NAMES.map((name, index) => ({ step_no: index + 1, name }));

  // We filter out Step 2, and we map Step 1 as a combined "Step 1 & Step 2"
  const displaySteps = allSteps.filter(s => s.step_no !== 2).map(s => {
    if (s.step_no === 1) {
      return {
        step_no: 1,
        isMerged: true,
        label: "Step 1 & Step 2",
        name: "Inward and Segregation"
      };
    }
    return {
      step_no: s.step_no,
      isMerged: false,
      label: `Step ${s.step_no}`,
      name: s.name
    };
  });

  return (
    <div className="pipeline-step-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
      {displaySteps.map((step) => {
        const stepNo = step.step_no;
        const isActive = step.isMerged 
          ? [1, 2].includes(selectedStep) 
          : selectedStep === stepNo;
          
        return (
          <div
            key={stepNo}
            onClick={() => onSelectStep(stepNo)}
            style={{
              padding: '10px 8px',
              borderRadius: 8,
              background: isActive ? 'rgba(255, 212, 0, 0.08)' : 'rgba(255,255,255,0.015)',
              border: isActive ? '1px solid #ffd400' : '1px solid rgba(255,255,255,0.03)',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s',
              boxShadow: isActive ? '0 0 10px rgba(255, 212, 0, 0.15)' : 'none',
              gridColumn: step.isMerged ? 'span 2' : 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontSize: '0.7rem', color: isActive ? 'var(--color-primary)' : 'var(--text-muted)', fontWeight: 800 }}>
                {step.label}
              </span>
              {!hidePCBsButton && (
                <span 
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewStepPanels(stepNo);
                  }}
                  style={{
                    fontSize: '0.62rem',
                    color: 'var(--color-primary)',
                    background: 'rgba(255, 212, 0, 0.1)',
                    border: '1px solid var(--card-border)',
                    borderRadius: 4,
                    padding: '1px 5px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontWeight: 700
                  }}
                  title="View PCBs details at this step"
                >
                  🔍 PCBs
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: isActive ? 800 : 500, color: isActive ? '#fff' : '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
              {step.name}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PipelineIndicator;
export { STEP_NAMES };
