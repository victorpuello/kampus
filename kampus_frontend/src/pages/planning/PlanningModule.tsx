import { useState } from 'react';
import AchievementBank from './AchievementBank';
import PeriodPlanning from './PeriodPlanning';
import { BookOpen, Calendar } from 'lucide-react';

export default function PlanningModule() {
  const [activeTab, setActiveTab] = useState<'bank' | 'planning'>('planning');

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white shadow mb-6">
        <div className="flex border-b overflow-x-auto">
          <button
            onClick={() => setActiveTab('planning')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap ${
              activeTab === 'planning'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Calendar size={20} />
            Planeación de Periodo
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap ${
              activeTab === 'bank'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
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
