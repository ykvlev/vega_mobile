import { DEFAULT_STUDIO_CHOICE, StudioChoiceSchema } from '@vega/contracts';
import { ConfiguratorStudio } from '../studio';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = StudioChoiceSchema.safeParse(await searchParams);
  return (
    <ConfiguratorStudio
      embedded
      initialChoice={parsed.success ? parsed.data : DEFAULT_STUDIO_CHOICE}
    />
  );
}
