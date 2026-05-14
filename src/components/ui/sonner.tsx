import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * shadcn 默认 sonner 用 oklch + next-themes，这里改成 DualGaze 项目主题色。
 * 暗色固定（项目没接亮色），accent-cyan = success / accent-danger = error。
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4 text-accent-cyan" />,
        info: <Info className="h-4 w-4 text-text-secondary" />,
        warning: <TriangleAlert className="h-4 w-4 text-accent" />,
        error: <OctagonX className="h-4 w-4 text-accent-danger" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin text-text-secondary" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast border bg-bg-surface text-text-primary border-border-subtle shadow-xl',
          description: 'text-text-secondary',
          actionButton: 'bg-accent text-bg',
          cancelButton: 'bg-bg-input text-text-secondary',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
