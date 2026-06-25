'use client'

interface Step {
  label: string
  href: string
  status: 'done' | 'active' | 'pending'
}

interface StepNavProps {
  steps: Step[]
}

export default function StepNav({ steps }: StepNavProps) {
  return (
    <nav className="flex items-center gap-0 mb-8 overflow-x-auto">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center">
          <a
            href={step.status !== 'pending' ? step.href : undefined}
            className={[
              'flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap rounded',
              step.status === 'active'
                ? 'bg-blue-600 text-white'
                : step.status === 'done'
                ? 'bg-green-50 text-green-700 hover:bg-green-100'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            <span
              className={[
                'w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold',
                step.status === 'active'
                  ? 'bg-white text-blue-600'
                  : step.status === 'done'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-500',
              ].join(' ')}
            >
              {step.status === 'done' ? '✓' : i + 1}
            </span>
            {step.label}
          </a>
          {i < steps.length - 1 && (
            <span className="text-gray-300 mx-1 text-lg select-none">›</span>
          )}
        </div>
      ))}
    </nav>
  )
}
