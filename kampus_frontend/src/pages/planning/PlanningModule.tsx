import { useState } from 'react';
import AchievementBank from './AchievementBank';
import PeriodPlanning from './PeriodPlanning';
import { BookOpen, Calendar } from 'lucide-react';

export default function PlanningModule() {
  const [activeTab, setActiveTab] = useState<'bank' | 'planning'>('planning');

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white dark:bg-slate-900 shadow-sm dark:shadow-none border border-slate-200 dark:border-slate-800 mb-6 rounded-lg overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          <button
            onClick={() => setActiveTab('planning')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
              activeTab === 'planning'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Calendar size={20} />
            Planeación de Periodo
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
              activeTab === 'bank'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <BookOpen size={20} />
            Banco de Logros
          </button>
        </div>
      </div>

      {activeTab === 'planning' && <PeriodPlanning />}
      {activeTab === 'bank' && <AchievementBank />}
    </div>
  );
}
