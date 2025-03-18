# boilerplate

Boilerplate repo for building web apps.

## Startup

***Note:** Replace `project-title` as appropriate.*

Create a new repository at Github named for the new site URL: `project-title.patrickdwyer.com`.

Clone the this repository:

`git clone git@github.com:patrickdwyer/boilerplate.git --recurse-submodules`

Rename the new project directory:

`mv boilerplate project-title.patrickdwyer.com`

Change into the new project directory:

`cd project-title.patrickdwyer.com`

Remove the link to the boilerplate repository:

`git remote remove origin`

Add the new repository as the origin:

`git remote add origin git@github.com:patrickdwyer/project-title.patrickdwyer.com.git`

Push everything to the new repository:

`git push -u origin main`

Install Node modules:

`npm install`