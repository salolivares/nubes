import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Input } from '../ui/input';

export const GeneralSettings = () => {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>AWS Credentials</CardTitle>
          <CardDescription>Used to retrieve and save images to s3 buckets</CardDescription>
        </CardHeader>
        <CardContent>
          <form>
            <Input placeholder="Store Name" />
          </form>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button>Save</Button>
        </CardFooter>
      </Card>
    </div>
  );
};
