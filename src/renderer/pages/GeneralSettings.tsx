import { AWSCredentialsForm } from '../components/AWSCredentialsForm';
import { GitHubSettingsForm } from '../components/GitHubSettingsForm';

export const GeneralSettings = () => {
  return (
    <div className="grid gap-6">
      <AWSCredentialsForm />
      <GitHubSettingsForm />
    </div>
  );
};
