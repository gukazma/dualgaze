import { Providers } from './app/providers';
import { CesiumViewer } from './features/viewer/CesiumViewer';

export function App() {
  return (
    <Providers>
      <CesiumViewer />
    </Providers>
  );
}
