import { Button, DatePicker, Segmented, Space } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import './AnalysisFilterBar.css';
import dayjs from 'dayjs';

type ViewType = '全部' | '支出' | '收入';

export interface AnalysisFilterBarProps {
  month: dayjs.Dayjs | null;
  onChangeMonth: (v: dayjs.Dayjs | null) => void;
  view: ViewType;
  onChangeView: (v: ViewType) => void;
}

export default function AnalysisFilterBar(props: AnalysisFilterBarProps) {
  const { month, onChangeMonth, view, onChangeView } = props;
  return (
    <div className="filter-bar analysis-filter-bar">
      <Space wrap>
        <DatePicker
          picker="month"
          allowClear
          placeholder="选择月份（空=全部）"
          value={month}
          onChange={(v) => onChangeMonth(v)}
          
          suffixIcon={<CalendarOutlined />}
        />
        <Button onClick={() => onChangeMonth(dayjs())}>本月</Button>
        <Button onClick={() => onChangeMonth(dayjs().add(-1, 'month'))}>上月</Button>
        <Segmented
          options={['全部', '支出', '收入']}
          value={view}
          onChange={(v) => onChangeView(v as ViewType)}
        />
      </Space>
    </div>
  );
}


