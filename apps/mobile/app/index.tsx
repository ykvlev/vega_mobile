import { CustomerApp } from '../src/customer-app';
import { SessionProvider } from '../src/session';
import { SelectionProvider } from '../src/selection';

export default function StartScreen() {
  return (
    <SessionProvider>
      <SelectionProvider>
        <CustomerApp />
      </SelectionProvider>
    </SessionProvider>
  );
}
