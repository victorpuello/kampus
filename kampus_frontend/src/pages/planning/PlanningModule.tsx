import { useState } from 'react';
import AchievementBank from './AchievementBank';
import PeriodPlanning from './PeriodPlanning';
import { BookOpen, Calendar } from 'lucide-react';

export default function PlanningModule() {
  const [activeTab, setActiveTab] = useState<'bank' | 'planning'>('planning');

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-0">
      <div className="bg-white dark:bg-slate-900 shadow-sm dark:shadow-none border border-slate-200 dark:border-slate-800 mb-4 sm:mb-6 rounded-lg overflow-hidden">
        <div className="grid grid-cols-1 gap-2 border-b border-slate-200 p-2 dark:border-slate-800 sm:grid-cols-2 sm:gap-0 sm:p-0">
          <button
            onClick={() => setActiveTab('planning')}
            className={`flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 px-4 py-3 text-center text-sm font-medium leading-tight whitespace-normal hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:px-6 sm:py-4 sm:justify-start sm:text-left ${
              activeTab === 'planning'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
            aria-pressed={activeTab === 'planning'}
          >
            <Calendar size={18} />
            Planeación de Periodo
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            className={`flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 px-4 py-3 text-center text-sm font-medium leading-tight whitespace-normal hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:px-6 sm:py-4 sm:justify-start sm:text-left ${
              activeTab === 'bank'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
            aria-pressed={activeTab === 'bank'}
          >
            <BookOpen size={18} />
            Banco de Logros
          </button>
        </div>
      </div>

      {activeTab === 'planning' && <PeriodPlanning />}
      {activeTab === 'bank' && <AchievementBank />}
    </div>
  );
}
