import { NavLink } from 'react-router-dom';
import Icon from './Icon';

const tabs = [
  { to: '/today', label: '오늘', icon: 'pen' as const },
  { to: '/records', label: '기록', icon: 'book' as const },
  { to: '/analysis', label: '분석', icon: 'sparkle' as const },
  { to: '/prompts', label: '프롬프트', icon: 'wand' as const },
];

export default function TabBar() {
  return (
    <nav className="tab-bar">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name={t.icon} className="ic" />
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
