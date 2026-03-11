import { handleAuth } from '@workos-inc/authkit-nextjs';

export const GET = handleAuth({
  onSuccess: async (user: any) => {
    try {
      // Call Go backend to create/check financial account for this user
      const response = await fetch(`${process.env.BACKEND_URL}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          workos_user_id: user.user?.id,
          owner: user.user?.firstName && user.user?.lastName
            ? `${user.user.firstName} ${user.user.lastName}`
            : user.user?.email || 'Unknown User',
        }),
      });

      if (!response.ok) {
        console.error('Failed to create account:', await response.text());
      } else {
        console.log('Financial account created for user');
      }
    } catch (error) {
      console.error('Error creating financial account:', error);
    }
  },
});